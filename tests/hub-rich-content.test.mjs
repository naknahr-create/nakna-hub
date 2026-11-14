import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';

// Real authentication, application controllers and migrations. SQLite and R2
// emulate the Workers bindings; no live provider or customer accounts are used.
const root = new URL('../', import.meta.url), testEnv = {};
const environmentKey = Symbol.for('nakna-hub.rich-content.environment');
globalThis[environmentKey] = testEnv;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {
      url: 'data:text/javascript,export const env=globalThis[Symbol.for("nakna-hub.rich-content.environment")];', shortCircuit: true,
    };
    const candidate = specifier.startsWith('@/') ? new URL(specifier.slice(2), root)
      : specifier.startsWith('.') && context.parentURL?.startsWith(root.href) ? new URL(specifier, context.parentURL) : null;
    if (candidate) {
      const file = candidate.pathname.endsWith('.ts') ? candidate : new URL(candidate.href + '.ts');
      if (existsSync(file)) return {url: file.href, shortCircuit: true};
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(root.href) && url.endsWith('.ts')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
      }).outputText,
    };
    return nextLoad(url, context);
  },
});
const {authenticateHubRequest} = await import('../lib/hub-auth.ts');
const hub = await import('../lib/hub-data.ts');
const teams = await import('../lib/hub-teams.ts');
const {HUB_GALLERY_LIMIT,hasBlockAction,blockImageUrls} = await import('../lib/hub-content.ts');
const ORIGIN = 'https://hub.example.com', CHANNEL = '1234567890';
const ACTORS = ['a', 'b', 'c', 'd'];
const identity = actor => `line:${CHANNEL}:U${actor.repeat(32)}`;
const cookie = actor => actor.repeat(43);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/4N8AAAAASUVORK5CYII=', 'base64');
const databases = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {throw new Error('Unexpected network request in rich content tests');};
after(() => {
  globalThis.fetch = originalFetch;
  hooks.deregister(); delete globalThis[environmentKey];
  for (const sql of databases) sql.close();
});
function sqlite() {
  const sql = new DatabaseSync(':memory:'); databases.push(sql); sql.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync(new URL('drizzle/', root)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sql.exec(readFileSync(new URL('drizzle/' + name, root), 'utf8'));
  }
  const statement = (query, values = []) => ({query, values,
    bind(...args) {return statement(query, args);},
    async first(column) {const row = sql.prepare(query).get(...values); return row ? column ? row[column] : {...row} : null;},
    async all() {return {results: sql.prepare(query).all(...values).map(row => ({...row})), success: true};},
    async run() {return this.execute();},
    execute() {const result = sql.prepare(query).run(...values); return {success: true, meta: {changes: Number(result.changes)}};},
  });
  return {sql, prepare: statement, async batch(statements) {
    sql.exec('BEGIN');
    try {const result = statements.map(s => s.execute()); sql.exec('COMMIT'); return result;}
    catch (error) {sql.exec('ROLLBACK'); throw error;}
  }};
}
function setup() {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  const objects = new Map();
  const bucket = {
    async put(key, bytes, options) {objects.set(key, {bytes: new Uint8Array(bytes), options});},
    async get(key) {const value = objects.get(key); return value ? {body: new Response(value.bytes).body, size: value.bytes.length} : null;},
    async delete(key) {objects.delete(key);},
  };
  Object.assign(testEnv, {DB: sqlite(), BUCKET: bucket, APP_ORIGIN: ORIGIN,
    LINE_LOGIN_CHANNEL_ID: CHANNEL, LINE_LOGIN_CHANNEL_SECRET: 'TEST_TEAMS_SECRET_NOT_REAL'});
  const now = Date.now();
  for (const actor of ACTORS) {
    testEnv.DB.sql.prepare(`INSERT INTO hub_line_sessions
      (token_hash,user_id,line_user_id,login_channel_id,origin,display_name,email,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(createHash('sha256').update(cookie(actor)).digest('hex'), identity(actor), identity(actor).split(':')[2], CHANNEL,
        ORIGIN, 'User ' + actor.toUpperCase(), '', now, now + 600000);
  }
  return {db: testEnv.DB.sql, objects};
}
async function request(path, {actor = 'a', method = 'GET', body, headers = {}} = {}) {
  return authenticateHubRequest(new Request(ORIGIN + path, {method,
    headers: {...(actor ? {Cookie: '__Host-nakna_session=' + cookie(actor)} : {}),
      ...(body !== undefined && !(body instanceof FormData) ? {'Content-Type': 'application/json'} : {}),
      ...(method !== 'GET' && method !== 'HEAD' ? {Origin: ORIGIN} : {}), ...headers},
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  }), testEnv);
}
const deny = error => [403, 404].includes(error.status);
const invalid = error => [400, 404].includes(error.status);
const conflict = error => error.status === 409;
const unavailableInvite = error => [400, 403, 404, 409, 410].includes(error.status);
const workspace = actor => request('/api/workspace', {actor}).then(hub.getWorkspace);
const account = async (actor = 'a') => (await workspace(actor)).account;
async function page(actor = 'a', suffix = '') {
  return hub.createPage(await request('/api/pages', {actor, method: 'POST', body: {
    name: 'Hub ' + actor + suffix, slug: 'owner-' + actor + suffix, template: 'creator',
  }}));
}
const readPage = (id, actor = 'a') => request('/api/pages/' + id, {actor}).then(r => hub.getPage(r, id));
async function revision(id, actor = 'a') {return (await readPage(id, actor)).revision;}
async function link(id, options = {}, actor = 'a') {
  return hub.createLink(await request('/api/pages/' + id + '/links', {actor, method: 'POST', body: {
    title: 'A website', url: 'https://example.com/store', revision: await revision(id, actor), ...options,
  }}), id);
}
async function publish(id, actor = 'a') {
  return hub.publishPage(await request('/api/pages/' + id + '/publish', {actor, method: 'POST', body: {revision: await revision(id, actor)}}), id);
}
async function upload(id, actor = 'a') {
  const form = new FormData(); form.append('file', new Blob([PNG], {type: 'image/png'}), 'icon.png');
  if (id) form.append('pageId', id);
  return hub.uploadAsset(await request('/api/uploads', {actor, method: 'POST', body: form}));
}
function paid(db, id, {status = 'active', live = 1, until = Date.now() + 86400000} = {}) {
  db.prepare("UPDATE hub_accounts SET plan='pro' WHERE id=?").run(id);
  db.prepare('INSERT INTO hub_billing_accounts(account_id,managed,updated_at) VALUES (?,1,?) ON CONFLICT(account_id) DO UPDATE SET managed=1').run(id,Date.now());
  db.prepare('DELETE FROM hub_billing_subscriptions WHERE account_id=?').run(id);
  db.prepare('INSERT INTO hub_billing_subscriptions VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('sub_'+id,id,'cus_'+id,'price_month','month',status,until,until,0,live,Date.now());
}
async function team(pageIds, actor = 'a') {
  return teams.createTeam(await request('/api/teams', {actor, method: 'POST', body: {name: 'Content team', pageIds}}));
}
async function invite(teamId, {role = 'editor', canPublish = false, actor = 'a'} = {}) {
  const result = await teams.createTeamInvite(await request('/api/teams/' + teamId + '/invites', {actor, method: 'POST', body: {role, canPublish}}), teamId);
  const token = new URL(result.url, ORIGIN).searchParams.get('invite');
  assert.ok(token, 'invite URL resumes in Studio after LINE login');
  return {...result, token};
}
async function accept(token, actor = 'b') {
  return teams.acceptTeamInvite(await request('/api/team-invites/' + token, {actor, method: 'POST', body: {}}), token);
}
async function detail(id, actor = 'a') {return teams.getTeam(await request('/api/teams/' + id, {actor}), id);}
async function memberId(teamId, actor = 'b') {
  const actorId = (await account(actor)).id;
  const member = (await detail(teamId)).members.find(row => row.accountId === actorId);
  assert.ok(member, 'invitation claim creates a member request');
  return member.id;
}
async function approve(teamId, actor = 'b', overrides = {}) {
  const id = await memberId(teamId, actor);
  return teams.updateTeamMember(await request('/api/teams/' + teamId + '/members/' + id,
    {method: 'PATCH', body: {action: 'approve', ...overrides}}), teamId, id);
}
async function sharing({role = 'editor', canPublish = false, paidOwner = false} = {}) {
  const ctx = setup(), p = await page(), a = await account();
  if (paidOwner) paid(ctx.db, a.id);
  const t = await team([p.page.id]), i = await invite(t.id, {role, canPublish});
  await accept(i.token); await approve(t.id);
  return {...ctx, p, a, t, i, b: await account('b')};
}

async function patchBlock(id, blockId, body, actor = 'a') {
  return hub.updateLink(await request(`/api/pages/${id}/links/${blockId}`, {actor, method: 'PATCH',
    body: {revision: await revision(id, actor), ...body}}), id, blockId);
}
async function patchProfile(id, profile, actor = 'a') {
  return hub.updatePage(await request(`/api/pages/${id}`, {actor, method: 'PATCH',
    body: {revision: await revision(id, actor), profile}}), id);
}
const publicHub = slug => request('/h/' + slug, {actor: null}).then(r => hub.getPublicHub(r, slug));
const publicAsset = url => request(url, {actor: null}).then(r => hub.serveAsset(r, url.slice(7)));
const missing = error => error.status === 404;

test('all content types round-trip without losing old links; image-only pages can publish', async () => {
  const {db} = setup(), p = await page(), id = p.page.id;
  paid(db, (await account()).id);
  const one = await upload(id), two = await upload(id), serviceImage = await upload(id);
  const specs = [
    {type: 'link', title: 'Legacy link', url: 'https://example.com/legacy'},
    {type: 'heading', title: 'What we do', url: ''},
    {type: 'text', title: 'About our company', description: 'We make useful products.\nTalk to our team.', url: ''},
    {type: 'image', title: 'Our studio', url: '', content: {imageUrl: one.url, alt: 'A photo of our studio', aspectRatio: 'auto'}},
    {type: 'gallery', title: 'Our work', url: '', content: {images: [{url: one.url, alt: 'First project'}, {url: two.url, alt: 'Second project', caption: 'Completed project'}], galleryLayout: 'carousel'}},
    {type: 'service', title: 'Design service', url: 'https://example.com/contact', content: {imageUrl: serviceImage.url, price: 'เริ่มต้น ฿1,500', buttonLabel: 'ขอรายละเอียด'}},
  ];
  const created = [];
  for (const spec of specs) created.push(await link(id, spec));
  const read = await readPage(id);
  assert.deepEqual(read.links.map(l => l.type), specs.map(l => l.type));
  assert.deepEqual(read.links, created);
  assert.equal(read.page.linkCount, 6);
  assert.equal((await workspace('a')).usage.links, 6);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_links WHERE content_json<>\'{}\'').get().n, 3);
  await publish(id);
  assert.deepEqual((await publicHub(p.page.slug)).links, created);
  assert.equal((await publicAsset(one.url)).status, 200);
  assert.equal((await publicAsset(two.url)).status, 200, 'gallery-only media is publicly readable');
  assert.equal((await publicAsset(serviceImage.url)).status, 200, 'service-only media is publicly readable');
  for (const block of created.filter(l => l.type !== 'image')) await patchBlock(id, block.id, {enabled: false});
  await publish(id);
  assert.deepEqual((await publicHub(p.page.slug)).links.map(l => l.type), ['image']);
  await assert.rejects(publicAsset(two.url), missing);
  await assert.rejects(publicAsset(serviceImage.url), missing);
});

test('rich media access follows the published snapshot, never unpublished edits or disabled blocks', async () => {
  setup(); const p = await page(), id = p.page.id;
  const oldImage = await upload(id), newImage = await upload(id), hiddenImage = await upload(id);
  const image = await link(id, {type: 'image', url: '', content: {imageUrl: oldImage.url}});
  await link(id, {type: 'service', title: 'Hidden offer', enabled: false, content: {imageUrl: hiddenImage.url}});
  await assert.rejects(publicAsset(oldImage.url), missing);
  await publish(id);
  assert.equal((await publicAsset(oldImage.url)).status, 200);
  await assert.rejects(publicAsset(hiddenImage.url), missing);
  await patchBlock(id, image.id, {content: {imageUrl: newImage.url}});
  assert.equal((await publicHub(p.page.slug)).links[0].content.imageUrl, oldImage.url);
  assert.equal((await publicAsset(oldImage.url)).status, 200);
  await assert.rejects(publicAsset(newImage.url), missing);
  await publish(id);
  assert.equal((await publicAsset(newImage.url)).status, 200);
  await assert.rejects(publicAsset(oldImage.url), missing);
  await hub.unpublishPage(await request(`/api/pages/${id}/unpublish`, {method: 'POST', body: {revision: await revision(id)}}), id);
  await assert.rejects(publicAsset(newImage.url), missing);
  assert.equal((await hub.serveAsset(await request(newImage.url), newImage.url.slice(7))).status, 200, 'owner can still edit the draft');
});

test('share covers are private drafts, retain old published cover until republish and stop serving when removed', async () => {
  setup(); const p = await page(), id = p.page.id;
  await link(id);
  const oldCover = await upload(id), newCover = await upload(id);
  await patchProfile(id, {shareImageUrl: oldCover.url});
  await assert.rejects(publicAsset(oldCover.url), missing);
  await publish(id);
  assert.equal((await publicHub(p.page.slug)).profile.shareImageUrl, oldCover.url);
  assert.equal((await publicAsset(oldCover.url)).status, 200);
  await patchProfile(id, {shareImageUrl: newCover.url});
  assert.equal((await publicHub(p.page.slug)).profile.shareImageUrl, oldCover.url);
  assert.equal((await publicAsset(oldCover.url)).status, 200);
  await assert.rejects(publicAsset(newCover.url), missing);
  await publish(id);
  assert.equal((await publicAsset(newCover.url)).status, 200);
  await assert.rejects(publicAsset(oldCover.url), missing);
  await patchProfile(id, {shareImageUrl: ''}); await publish(id);
  await assert.rejects(publicAsset(newCover.url), missing);
  assert.equal((await publicHub(p.page.slug)).profile.shareImageUrl, '');
});

test('owned uploaded media is required; another account cannot attach or fetch private content or share covers', async () => {
  setup(); const p = await page(), foreign = await page('c'), id = p.page.id;
  const secret = await upload(foreign.page.id, 'c');
  const invalidMedia = [secret.url, '/media/' + crypto.randomUUID(), 'https://example.com/image.png', 'data:image/png;base64,xxx', 'javascript:alert(1)'];
  for (const url of invalidMedia) {
    await assert.rejects(link(id, {type: 'image', url: '', content: {imageUrl: url}}), invalid);
    await assert.rejects(link(id, {type: 'gallery', url: '', content: {images: [{url, alt: 'Private photo'}]}}), invalid);
    await assert.rejects(link(id, {type: 'service', content: {imageUrl: url}}), invalid);
    await assert.rejects(patchProfile(id, {shareImageUrl: url}), invalid);
  }
  await assert.rejects(hub.serveAsset(await request(secret.url), secret.url.slice(7)), missing);
  assert.equal((await readPage(id)).links.length, 0);
  assert.equal((await readPage(id)).profile.shareImageUrl, '');
});

test('gallery bounds, captions, structured fields, plain text and URL validation are enforced on the server', async () => {
  setup(); const p = await page(), id = p.page.id, image = await upload(id);
  const invalidSpecs = [
    {type: 'image', content: {}},
    {type: 'image', content: {imageUrl: image.url, aspectRatio: 'infinite'}},
    {type: 'image', content: {imageUrl: image.url, fit: 'html'}},
    {type: 'image', content: {imageUrl: image.url, fit: ['cover']}},
    {type: 'image', content: {imageUrl: image.url, aspectRatio: ['square']}},
    {type: 'image', content: {imageUrl: image.url, alt: 'a'.repeat(241)}},
    {type: 'image', content: {imageUrl: image.url, buttonLabel: 'x'.repeat(61)}},
    {type: 'image', content: {imageUrl: image.url, onClick: 'alert(1)'}},
    {type: 'image', content: []},
    {type: 'image', content: null},
    {type: 'gallery', content: {images: []}},
    {type: 'gallery', content: {images: Array.from({length: 7}, () => ({url: image.url, alt: ''}))}},
    {type: 'gallery', content: {images: [{url: image.url}, {url: image.url}]}},
    {type: 'gallery', content: {images: [{url: image.url, caption: 'a'.repeat(301)}]}},
    {type: 'gallery', content: {images: [{url: image.url}], galleryLayout: 'html'}},
    {type: 'gallery', content: {images: [{url: image.url}], galleryLayout: ['grid']}},
    {type: 'service', content: {price: 'x'.repeat(81)}},
    {type: 'service', description: 'a'.repeat(2001)},
    {type: 'text', url: '', description: ''},
    {type: 'text', url: '', description: '<iframe src="https://example.com"></iframe>'},
    {type: 'service', url: 'javascript:alert(1)', content: {}},
    {type: 'service', url: 'https://user:secret@example.com', content: {}},
    {type: 'service', url: 'http://127.0.0.1', content: {}},
  ];
  for (const spec of invalidSpecs) await assert.rejects(link(id, spec), invalid, JSON.stringify(spec).slice(0,120));
  assert.equal((await readPage(id)).links.length, 0);
  const text = await link(id, {type: 'text', title: 'A real story', description: 'a'.repeat(2000), url: ''});
  assert.equal(text.description.length, 2000);
  const gallery = [];
  for (let i = 0; i < HUB_GALLERY_LIMIT; i++) gallery.push({url: (await upload(id)).url, alt: 'Work ' + i});
  const block = await link(id, {type: 'gallery', title: 'Six projects', url: '', content: {images: gallery}});
  assert.equal(block.content.images.length, 6);
  assert.equal((await readPage(id)).page.linkCount, 2, 'six gallery photos count as one bounded content item');
});

test('Starter quota counts five mixed content blocks, including hidden items; archiving releases one slot', async () => {
  setup(); const p = await page(), id = p.page.id, image = await upload(id);
  const first = await link(id, {type: 'image', enabled: false, url: '', content: {imageUrl: image.url}});
  await link(id, {type: 'heading', title: 'Services', url: ''});
  await link(id, {type: 'service', title: 'Consulting', url: '', content: {price: 'สอบถามราคา'}});
  await link(id, {type: 'text', title: 'About', description: 'Company information', url: ''});
  await link(id, {type: 'gallery', title: 'Work', url: '', content: {images: [{url: image.url, alt: 'Our work'}]}});
  assert.equal((await readPage(id)).page.linkCount, 5);
  assert.equal((await workspace('a')).usage.links, 5);
  await assert.rejects(link(id, {title: 'Sixth'}), conflict);
  await hub.archiveLink(await request(`/api/pages/${id}/links/${first.id}?revision=${await revision(id)}`, {method: 'DELETE'}), id, first.id);
  await link(id, {title: 'Available slot'});
  await assert.rejects(patchBlock(id, first.id, {archived: false}), conflict);
  assert.equal((await readPage(id)).page.linkCount, 5);
});

test('rich CTA redirects use published destinations, record actual clicks and appear in paid analytics', async () => {
  const {db} = setup(), p = await page(), id = p.page.id;
  paid(db, (await account()).id);
  const image = await upload(id);
  const actionBlocks = [];
  actionBlocks.push(await link(id, {type: 'image', title: 'Image CTA', url: 'https://example.com/image', content: {imageUrl: image.url}}));
  actionBlocks.push(await link(id, {type: 'gallery', title: 'Gallery CTA', url: 'https://example.com/gallery', content: {images: [{url: image.url, alt: 'Work'}]}}));
  actionBlocks.push(await link(id, {type: 'service', title: 'Service CTA', url: 'https://example.com/service', content: {price: '฿500', buttonLabel: 'ติดต่อ'}}));
  const noAction = await link(id, {type: 'image', title: 'Image without destination', url: '', content: {imageUrl: image.url}});
  await publish(id);
  const headers = {'User-Agent': 'Mozilla/5.0 Chrome/130.0 Safari/537.36'};
  for (const block of actionBlocks) {
    assert.equal(hasBlockAction(block), true);
    const redirect = await hub.goToLink(await request(`/go/${p.page.slug}/${block.id}`, {actor: null, headers}), p.page.slug, block.id);
    assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('Location'), block.url);
  }
  assert.equal(hasBlockAction(noAction), false);
  await assert.rejects(hub.goToLink(await request(`/go/${p.page.slug}/${noAction.id}`, {actor: null, headers}), p.page.slug, noAction.id), missing);
  for (const block of actionBlocks) await hub.goToLink(await request(`/go/${p.page.slug}/${block.id}`, {headers}), p.page.slug, block.id);
  await publicAsset(image.url);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hub_events WHERE type='click'").get().n, 3, 'owner visits and fetching images never count as outbound clicks');
  const analytics = await hub.analytics(await request(`/api/pages/${id}/analytics?range=all`), id);
  assert.equal(analytics.activeLinks, 3); assert.equal(analytics.totalClicks, 3);
  assert.deepEqual(analytics.ranking.map(l => l.title).sort(), actionBlocks.map(l => l.title).sort());
  await patchBlock(id, actionBlocks[0].id, {url: ''});
  const stillPublished = await hub.goToLink(await request(`/go/${p.page.slug}/${actionBlocks[0].id}`, {actor: null, headers}), p.page.slug, actionBlocks[0].id);
  assert.equal(stillPublished.headers.get('Location'), 'https://example.com/image');
  await publish(id);
  await assert.rejects(hub.goToLink(await request(`/go/${p.page.slug}/${actionBlocks[0].id}`, {actor: null, headers}), p.page.slug, actionBlocks[0].id), missing);
  const historic = await hub.analytics(await request(`/api/pages/${id}/analytics?range=all&linkId=${actionBlocks[0].id}`), id);
  assert.equal(historic.selectedLink.clicks, 2); assert.equal(historic.activeLinks, 2);
});

test('team editor can use assigned hub images but cannot reuse unrelated private owner or personal images', async () => {
  const {db,p,a,t,b} = await sharing({paidOwner: true}), id = p.page.id;
  const other = await page('a', '-private'), ownPrivate = await upload(other.page.id), memberPrivate = await upload(null, 'b');
  const shared = await upload(id, 'b');
  const image = await link(id, {type: 'image', title: 'Team image', url: '', content: {imageUrl: shared.url}}, 'b');
  await patchProfile(id, {shareImageUrl: shared.url}, 'b');
  assert.equal((await hub.serveAsset(await request(shared.url, {actor: 'b'}), shared.url.slice(7))).status, 200);
  for (const asset of [ownPrivate, memberPrivate]) {
    await assert.rejects(link(id, {type: 'gallery', url: '', content: {images: [{url: asset.url, alt: 'Secret'}]}}, 'b'), invalid);
    await assert.rejects(patchProfile(id, {shareImageUrl: asset.url}, 'b'), invalid);
  }
  // The owner may attach an asset from another owned hub; that explicit reference
  // makes it usable by the shared hub's editor without exposing any other asset.
  await link(id, {type: 'gallery', title: 'Owner attached work', url: '', content: {images: [{url: ownPrivate.url, alt: 'Shared work'}]}});
  assert.equal((await hub.serveAsset(await request(ownPrivate.url, {actor: 'b'}), ownPrivate.url.slice(7))).status, 200);
  await assert.rejects(publicAsset(ownPrivate.url), missing);
  await patchBlock(id, image.id, {content: {imageUrl: ownPrivate.url}}, 'b');
  await assert.rejects(publish(id, 'b'), deny);
  await publish(id);
  const viewerInvitation = await invite(t.id, {role: 'viewer'}); await accept(viewerInvitation.token, 'c'); await approve(t.id, 'c');
  await assert.rejects(patchBlock(id, image.id, {description: 'Viewer edit'}, 'c'), deny);
  await assert.rejects(upload(id, 'c'), deny);
  const privateDraft = await upload(id, 'b');
  const member = await memberId(t.id, 'b');
  await teams.revokeTeamMember(await request(`/api/teams/${t.id}/members/${member}`, {method: 'DELETE'}), t.id, member);
  await assert.rejects(hub.serveAsset(await request(privateDraft.url, {actor: 'b'}), privateDraft.url.slice(7)), missing);
  await assert.rejects(patchBlock(id, image.id, {description: 'Revoked editor'}, 'b'), deny);
  assert.equal(db.prepare('SELECT account_id FROM hub_assets WHERE id=?').get(shared.url.slice(7)).account_id, a.id);
  assert.notEqual(a.id, b.id);
});



test('single Save updates several edited links under one page revision', async()=>{
  setup();
  const pageData=await page(),id=pageData.page.id;
  const first=await link(id,{title:'First link',url:'https://example.com/one'});
  const second=await link(id,{title:'Second link',url:'https://example.com/two'});
  const before=await revision(id);
  const updated=await hub.saveLinksBatch(await request(`/api/pages/${id}/links/batch`,{
    method:'PATCH',body:{revision:before,links:[
      {id:first.id,title:'First changed',enabled:false},
      {id:second.id,title:'Second changed',url:'https://example.com/three'},
    ]}
  }),id);
  assert.equal(updated.revision,before+1,'batch increments revision once');
  assert.equal(updated.links.find(row=>row.id===first.id).title,'First changed');
  assert.equal(updated.links.find(row=>row.id===first.id).enabled,false);
  assert.equal(updated.links.find(row=>row.id===second.id).url,'https://example.com/three');
  assert.equal((await readPage(id)).revision,before+1);
});

test('single Save validates every row before writing and refuses stale or foreign records', async()=>{
  setup();
  const pageData=await page(),id=pageData.page.id;
  const a=await link(id,{title:'Original A',url:'https://example.com/a'});
  const b=await link(id,{title:'Original B',url:'https://example.com/b'});
  const before=await revision(id);
  async function save(payload,actor='a'){
    return hub.saveLinksBatch(await request(`/api/pages/${id}/links/batch`,{
      actor,method:'PATCH',body:payload
    }),id);
  }
  await assert.rejects(save({revision:before,links:[
    {id:a.id,title:'Would be saved'},
    {id:b.id,url:'javascript:alert(1)'}
  ]}),invalid);
  assert.equal((await readPage(id)).links.find(row=>row.id===a.id).title,'Original A');
  assert.equal(await revision(id),before,'failed validation must not mutate a revision');
  await assert.rejects(save({revision:before,links:[{id:a.id,title:'Repeated'}, {id:a.id,title:'Repeated again'}]}),invalid);
  await assert.rejects(save({revision:before,links:[{id:'unknown-link',title:'Other account'}]}),invalid);
  await assert.rejects(save({revision:before,links:[{id:a.id,title:'No access'}]},'b'),deny);
  await patchBlock(id,a.id,{title:'Changed from another request'});
  await assert.rejects(save({revision:before,links:[{id:b.id,title:'Stale'}]}),conflict);
});

test('Studio content cards use one Save control instead of individual buttons',()=>{
  const source=readFileSync(new URL('../app/components/HubStudio.tsx',import.meta.url),'utf8');
  assert.match(source,/className="hs-profile-save hs-content-save"/);
  assert.match(source,/saveAllLinks\(\)/);
  assert.match(source,/hs-row-unsaved/);
  assert.doesNotMatch(source,/hs-save-link/);
  assert.doesNotMatch(source,/บันทึกฉบับร่าง<\/button>/);
});


test('affiliate promotion shows 100 -> 80 baht as a 20% discount and counts a real outbound click',async()=>{
  const {db}=setup(),p=await page(),id=p.page.id;
  paid(db,(await account()).id);
  const img=await upload(id);
  const promotion=await link(id,{type:'promotion',title:'สินค้าลดราคา',url:'https://shop.example.com/item?affiliate=abc',
    content:{imageUrl:img.url,alt:'สินค้าทดลอง',aspectRatio:'square',fit:'contain',buttonLabel:'ดูสินค้า / ซื้อเลย',originalPrice:'100',salePrice:'80'}});
  const pricing=await import('../lib/hub-promotion.ts');
  assert.deepEqual(pricing.getPromotionPricing('100','80'),{
    originalSatang:10000,saleSatang:8000,savingsSatang:2000,discountPercent:20
  });
  assert.equal(pricing.formatThaiBaht(8000),'฿80');
  assert.equal(hasBlockAction(promotion),true);
  assert.equal(blockImageUrls(promotion)[0],img.url);
  await assert.rejects(publicAsset(img.url),missing,'draft image stays private before publishing');
  await publish(id);
  const published=await publicHub(p.page.slug);
  assert.equal(published.links[0].type,'promotion');
  assert.equal(published.links[0].content.originalPrice,'100');
  assert.equal(published.links[0].content.salePrice,'80');
  assert.equal((await publicAsset(img.url)).status,200,'published promotion image is public');
  const redirect=await hub.goToLink(await request(`/go/${p.page.slug}/${promotion.id}`,{actor:null,headers:{"User-Agent":"Mozilla/5.0 Chrome/130.0 Safari/537.36"}}),p.page.slug,promotion.id);
  assert.equal(redirect.status,302);
  assert.equal(redirect.headers.get('Location'),'https://shop.example.com/item?affiliate=abc');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hub_events WHERE type='click'").get().n,1);
  await patchBlock(id,promotion.id,{enabled:false});
  await publish(id);
  await assert.rejects(publicAsset(img.url),missing,'disabled promo images become private');
});

test('promotion requires a real image, positive prices, discount and an affiliate product URL',async()=>{
  setup();const p=await page(),id=p.page.id,img=await upload(id);
  const valid={imageUrl:img.url,originalPrice:'100',salePrice:'80'};
  const invalidSpecs=[
    {url:'',content:valid},
    {url:'mailto:hello@example.com',content:valid},
    {url:'javascript:alert(1)',content:valid},
    {url:'https://shop.example.com/a',content:{...valid,imageUrl:''}},
    {url:'https://shop.example.com/a',content:{...valid,originalPrice:'80',salePrice:'100'}},
    {url:'https://shop.example.com/a',content:{...valid,originalPrice:'100',salePrice:'100'}},
    {url:'https://shop.example.com/a',content:{...valid,originalPrice:'-100'}},
    {url:'https://shop.example.com/a',content:{...valid,originalPrice:'฿100'}},
    {url:'https://shop.example.com/a',content:{...valid,salePrice:'0'}},
    {url:'https://shop.example.com/a',content:{...valid,salePrice:'80.999'}},
    {url:'https://shop.example.com/a',content:{...valid,discountPercent:20}},
  ];
  for(const spec of invalidSpecs){
    await assert.rejects(link(id,{type:'promotion',title:'Invalid sale',...spec}),invalid,
      'invalid promotion must be rejected');
  }
  assert.equal((await readPage(id)).links.length,0);
});


test('service product discount switch saves sale pricing and removes the sale when turned off',async()=>{
  const {db}=setup(),p=await page(),id=p.page.id;
  paid(db,(await account()).id);
  const image=await upload(id);
  const discount=await link(id,{
    type:'service',title:'กระเป๋าลดราคา',url:'https://shop.example.com/item?ref=partner',
    content:{imageUrl:image.url,hasPromotion:true,originalPrice:'100',salePrice:'80',price:'สอบถามราคา',buttonLabel:'ดูสินค้า / ซื้อเลย'}
  });
  assert.equal(discount.type,'service','new discounted products are ordinary services');
  assert.equal(discount.content.hasPromotion,true);
  assert.equal(discount.content.originalPrice,'100');
  assert.equal(discount.content.salePrice,'80');
  const {getPromotionPricing,isProductDiscountEnabled}=await import('../lib/hub-promotion.ts');
  assert.equal(isProductDiscountEnabled(discount.type,discount.content),true);
  assert.equal(getPromotionPricing(discount.content.originalPrice,discount.content.salePrice).discountPercent,20);
  await publish(id);
  assert.equal((await publicHub(p.page.slug)).links[0].content.hasPromotion,true);
  const originalRevision=await revision(id);
  const without=await patchBlock(id,discount.id,{
    url:'',
    content:{...discount.content,hasPromotion:false,price:'฿80',buttonLabel:'สอบถามรายละเอียด'}
  });
  assert.equal(without.id,discount.id);
  assert.equal(without.type,'service');
  assert.equal(without.content.hasPromotion,false);
  assert.equal(without.content.price,'฿80');
  assert.equal(without.content.originalPrice,undefined,'old price must be cleared when discount is off');
  assert.equal(without.content.salePrice,undefined,'sale price must not leak after disabling discount');
  assert.equal(without.url,'','non-discounted services can omit a destination');
  assert.ok((await revision(id))>originalRevision);
  assert.equal((await publicHub(p.page.slug)).links[0].content.hasPromotion,true,
    'published snapshot stays unchanged until a new publish');
  await publish(id);
  assert.equal((await publicHub(p.page.slug)).links[0].content.hasPromotion,false);
});

test('service discount switch validates boolean, image, prices, and outbound link',async()=>{
  setup();const p=await page(),id=p.page.id,image=await upload(id);
  const offer={imageUrl:image.url,hasPromotion:true,originalPrice:'100',salePrice:'80'};
  const invalidOffers=[
    {url:'',content:offer},
    {url:'mailto:hello@example.com',content:offer},
    {url:'https://shop.example.com',content:{...offer,imageUrl:''}},
    {url:'https://shop.example.com',content:{...offer,originalPrice:'90',salePrice:'100'}},
    {url:'https://shop.example.com',content:{...offer,originalPrice:'100',salePrice:'100'}},
    {url:'https://shop.example.com',content:{...offer,hasPromotion:'yes'}},
    {url:'https://shop.example.com',content:{...offer,salePrice:'0'}},
  ];
  for(const item of invalidOffers){
    await assert.rejects(link(id,{type:'service',title:'Bad discount',...item}),invalid);
  }
  assert.equal((await readPage(id)).links.length,0);
  const regular=await link(id,{
    type:'service',title:'Normal product',url:'',
    content:{price:'สอบถามราคา',hasPromotion:false,originalPrice:'100',salePrice:'80'}
  });
  assert.equal(regular.content.hasPromotion,false);
  assert.equal(regular.content.originalPrice,undefined,'disabled discount must ignore old prices');
  assert.equal(regular.content.salePrice,undefined);
});

test('legacy promotion converts in-place to product with enabled discount without losing IDs or click history',async()=>{
  const {db}=setup(),p=await page(),id=p.page.id;
  paid(db,(await account()).id);
  const image=await upload(id);
  const old=await link(id,{
    type:'promotion',title:'Existing offer',url:'https://shop.example.com/legacy?aff=old',
    content:{imageUrl:image.url,originalPrice:'100',salePrice:'80',buttonLabel:'ดูสินค้า / ซื้อเลย'}
  });
  await publish(id);
  const redirect=await hub.goToLink(await request(`/go/${p.page.slug}/${old.id}`,{
    actor:null,headers:{'User-Agent':'Mozilla/5.0 Chrome/130.0 Safari/537.36'}
  }),p.page.slug,old.id);
  assert.equal(redirect.status,302);
  const clickCount=()=>db.prepare("SELECT COUNT(*) AS n FROM hub_events WHERE link_id=? AND type='click'").get(old.id).n;
  assert.equal(clickCount(),1);
  const saved=await hub.saveLinksBatch(await request(`/api/pages/${id}/links/batch`,{
    method:'PATCH',body:{revision:await revision(id),links:[{
      id:old.id,type:'service',title:old.title,description:old.description,url:old.url,icon:old.icon,
      content:{...old.content,price:'฿80',hasPromotion:true},enabled:true,featured:false
    }]}
  }),id);
  const migrated=saved.links.find(x=>x.id===old.id);
  assert.ok(migrated);
  assert.equal(migrated.type,'service');
  assert.equal(migrated.content.hasPromotion,true);
  assert.equal(migrated.content.originalPrice,'100');
  assert.equal(migrated.content.salePrice,'80');
  assert.equal(migrated.url,old.url);
  assert.equal(clickCount(),1,'migration cannot reset historical clicks');
  assert.equal((await publicHub(p.page.slug)).links[0].type,'promotion',
    'existing published snapshot remains untouched until publishing again');
  await publish(id);
  assert.equal((await publicHub(p.page.slug)).links[0].type,'service');
});


test('product photo focus and zoom persist in drafts and published snapshots',async()=>{
  setup();const p=await page(),id=p.page.id;
  const image=await upload(id);
  const product=await link(id,{
    type:'service',title:'Product with focal image',url:'https://example.com/order',
    content:{imageUrl:image.url,fit:'cover',price:'1000',imageFocusX:25,imageFocusY:15,imageZoom:145}
  });
  assert.equal(product.content.imageFocusX,25);
  assert.equal(product.content.imageFocusY,15);
  assert.equal(product.content.imageZoom,145);
  const draft=(await readPage(id)).links.find(item=>item.id===product.id);
  assert.equal(draft.content.imageZoom,145);
  await publish(id);
  const publicProduct=(await publicHub(p.page.slug)).links.find(item=>item.id===product.id);
  assert.equal(publicProduct.content.imageFocusX,25);
  assert.equal(publicProduct.content.imageFocusY,15);
  assert.equal(publicProduct.content.imageZoom,145);
  const updated=await patchBlock(id,product.id,{content:{
    ...product.content,imageFocusX:80,imageFocusY:65,imageZoom:110
  }});
  assert.equal(updated.id,product.id);
  assert.equal(updated.content.imageFocusX,80);
  assert.equal(updated.content.imageFocusY,65);
  assert.equal(updated.content.imageZoom,110);
  assert.equal((await publicHub(p.page.slug)).links[0].content.imageZoom,145,
    'new framing does not go live until the owner publishes');
  await publish(id);
  assert.equal((await publicHub(p.page.slug)).links[0].content.imageZoom,110);
});

test('product photo framing accepts only bounded integer percentages',async()=>{
  setup();const p=await page(),id=p.page.id;const image=await upload(id);
  const base={imageUrl:image.url,fit:'cover',price:'500'};
  const badCases=[
    {imageFocusX:-1},{imageFocusX:101},{imageFocusX:35.5},{imageFocusX:'50'},
    {imageFocusY:-1},{imageFocusY:101},{imageFocusY:null},
    {imageZoom:99},{imageZoom:181},{imageZoom:125.2},{imageZoom:'135'},
  ];
  for(const bad of badCases){
    await assert.rejects(link(id,{
      type:'service',title:'Invalid focal point',url:'https://example.com/order',
      content:{...base,...bad}
    }),invalid,'out-of-range photo framing must not save');
  }
  assert.equal((await readPage(id)).links.length,0);
  const normal=await link(id,{type:'service',title:'Default picture',url:'',content:base});
  assert.equal(normal.content.imageFocusX,undefined,'older products need no new fields');
  assert.equal(normal.content.imageFocusY,undefined);
  assert.equal(normal.content.imageZoom,undefined);
});
