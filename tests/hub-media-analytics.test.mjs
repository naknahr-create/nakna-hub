import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';

// Real application modules and SQLite migrations; only the Workers environment
// and R2 storage are local adapters. No provider or public network requests.
const root = new URL('../', import.meta.url), testEnv = {};
const environmentKey = Symbol.for('nakna-hub.media-analytics.environment');
globalThis[environmentKey] = testEnv;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {
      url: 'data:text/javascript,export const env=globalThis[Symbol.for("nakna-hub.media-analytics.environment")];', shortCircuit: true,
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
const {createPage, createLink, updateLink, getPage, publishPage, archiveLink, unpublishPage,
  uploadAsset, serveAsset, getPublicHub, recordView, goToLink, analytics, exportAnalytics} = await import('../lib/hub-data.ts');
const ORIGIN = 'https://hub.example.com', CHANNEL = '1234567890';
const OWNER_A = `line:${CHANNEL}:U${'a'.repeat(32)}`, OWNER_B = `line:${CHANNEL}:U${'b'.repeat(32)}`;
const COOKIE_A = 'a'.repeat(43), COOKIE_B = 'b'.repeat(43);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/4N8AAAAASUVORK5CYII=', 'base64');
const databases = [];
after(() => {
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
    LINE_LOGIN_CHANNEL_ID: CHANNEL, LINE_LOGIN_CHANNEL_SECRET: 'TEST_MEDIA_SECRET_NOT_REAL'});
  const now = Date.now();
  for (const [user, token] of [[OWNER_A, COOKIE_A], [OWNER_B, COOKIE_B]]) {
    testEnv.DB.sql.prepare(`INSERT INTO hub_line_sessions
      (token_hash,user_id,line_user_id,login_channel_id,origin,display_name,email,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(createHash('sha256').update(token).digest('hex'), user, user.split(':')[2], CHANNEL,
        ORIGIN, user === OWNER_A ? 'Owner A' : 'Owner B', '', now, now + 600000);
  }
  return {db: testEnv.DB.sql, objects};
}
async function request(path, {actor = 'a', method = 'GET', body, headers = {}} = {}) {
  const token = actor === 'a' ? COOKIE_A : actor === 'b' ? COOKIE_B : '';
  return authenticateHubRequest(new Request(ORIGIN + path, {method,
    headers: {...(token ? {Cookie: '__Host-nakna_session=' + token} : {}),
      ...(body !== undefined && !(body instanceof FormData) ? {'Content-Type': 'application/json'} : {}),
      ...(method !== 'GET' && method !== 'HEAD' ? {Origin: ORIGIN} : {}), ...headers},
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  }), testEnv);
}
async function page(actor = 'a') {
  return createPage(await request('/api/pages', {actor, method: 'POST', body: {name: 'Hub ' + actor, slug: 'owner-' + actor, template: 'creator'}}));
}
async function link(pageId, options = {}, actor = 'a') {
  return createLink(await request('/api/pages/' + pageId + '/links', {actor, method: 'POST', body: {
    title: 'A website', url: 'https://example.com/store', ...options,
  }}), pageId);
}
async function upload(actor = 'a', blob = new Blob([PNG], {type: 'image/png'})) {
  const form = new FormData(); form.append('file', blob, 'icon.png');
  return uploadAsset(await request('/api/uploads', {actor, method: 'POST', body: form}));
}
async function publish(pageId, actor = 'a') {
  return publishPage(await request('/api/pages/' + pageId + '/publish', {actor, method: 'POST', body: {}}), pageId);
}
async function readAnalytics(pageId, query = 'range=all', actor = 'a') {
  return analytics(await request('/api/pages/' + pageId + '/analytics?' + query, {actor}), pageId);
}
function event(db, pageId, type, linkId = null, time = Date.now(), device = 'มือถือ', source = 'LINE') {
  db.prepare('INSERT INTO hub_events (id,page_id,type,link_id,created_at,device,source) VALUES (?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), pageId, type, linkId, time, device, source);
}

test('new links default to website icons and uploaded images are owned assets', async () => {
  const {db, objects} = setup(), a = await page(), b = await page('b');
  const auto = await link(a.page.id); assert.equal(auto.icon, 'auto');
  const imageA = await upload(), imageB = await upload('b');
  const custom = await link(a.page.id, {icon: 'image:' + imageA.url.slice(7)});
  assert.equal(custom.icon, 'image:' + imageA.url.slice(7));
  assert.equal(objects.size, 2);
  assert.equal(db.prepare('SELECT icon FROM hub_links WHERE id=?').get(custom.id).icon, custom.icon);
  await assert.rejects(link(a.page.id, {icon: 'image:' + imageB.url.slice(7)}), error => error.status === 400);
  await assert.rejects(updateLink(await request('/api/pages/' + a.page.id + '/links/' + custom.id,
    {method: 'PATCH', body: {icon: 'image:' + imageB.url.slice(7)}}), a.page.id, custom.id), error => error.status === 400);
  await assert.rejects(link(b.page.id, {icon: custom.icon}, 'b'), error => error.status === 400);
  for (const icon of ['image:../private', 'image:' + crypto.randomUUID(), 'https://other.example/icon.png', 'data:image/png;base64,AAA']) {
    await assert.rejects(link(a.page.id, {icon}), error => error.status === 400);
  }
});

test('draft link images stay private and published snapshots grant only the visible image', async () => {
  setup(); const a = await page(), firstImage = await upload(), replacement = await upload();
  const custom = await link(a.page.id, {icon: 'image:' + firstImage.url.slice(7)});
  const publicImage = async url => serveAsset(await request(url, {actor: null}), url.slice(7));
  assert.equal((await serveAsset(await request(firstImage.url), firstImage.url.slice(7))).status, 200);
  await assert.rejects(publicImage(firstImage.url), error => error.status === 404);
  await assert.rejects(serveAsset(await request(firstImage.url, {actor: 'b'}), firstImage.url.slice(7)), error => error.status === 404);
  await publish(a.page.id);
  const response = await publicImage(firstImage.url);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  const publicHub = await getPublicHub(await request('/api/hubs/owner-a', {actor: null}), 'owner-a');
  assert.equal(publicHub.links[0].icon, custom.icon);
  await updateLink(await request('/api/pages/' + a.page.id + '/links/' + custom.id,
    {method: 'PATCH', body: {icon: 'image:' + replacement.url.slice(7)}}), a.page.id, custom.id);
  assert.equal((await publicImage(firstImage.url)).status, 200, 'draft edits do not remove the published image');
  await assert.rejects(publicImage(replacement.url), error => error.status === 404, 'new draft media is not published early');
  await publish(a.page.id);
  await assert.rejects(publicImage(firstImage.url), error => error.status === 404);
  assert.equal((await publicImage(replacement.url)).status, 200);
  await unpublishPage(await request('/api/pages/' + a.page.id + '/unpublish', {method: 'POST'}), a.page.id);
  await assert.rejects(publicImage(replacement.url), error => error.status === 404);
});

test('publishing rechecks image ownership and disabled image links do not expose assets', async () => {
  const {db} = setup(), a = await page(), b = await page('b'), privateImage = await upload();
  await link(a.page.id);
  const disabled = await link(a.page.id, {enabled: false, icon: 'image:' + privateImage.url.slice(7)});
  await publish(a.page.id);
  await assert.rejects(serveAsset(await request(privateImage.url, {actor: null}), privateImage.url.slice(7)), error => error.status === 404);
  await updateLink(await request('/api/pages/' + a.page.id + '/links/' + disabled.id,
    {method: 'PATCH', body: {enabled: true}}), a.page.id, disabled.id);
  // Simulate an asset no longer belonging to this account between draft/save and publish.
  const otherAccount = db.prepare('SELECT account_id FROM hub_pages WHERE id=?').get(b.page.id).account_id;
  db.prepare('UPDATE hub_assets SET account_id=? WHERE id=?').run(otherAccount, privateImage.url.slice(7));
  await assert.rejects(publish(a.page.id), error => error.status === 400);
});

test('image uploads reject MIME disguises and files over the supported limit', async () => {
  setup();
  await assert.rejects(upload('a', new Blob(['<svg><script>alert(1)</script></svg>'], {type: 'image/png'})), error => error.status === 400);
  await assert.rejects(upload('a', new Blob([PNG], {type: 'image/jpeg'})), error => error.status === 400);
  await assert.rejects(upload('a', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], {type: 'image/png'})), error => error.status === 413);
});

test('analytics ranks actual clicks, keeps archived history and does not clamp event ratios', async () => {
  const {db} = setup(), a = await page(), one = await link(a.page.id), two = await link(a.page.id, {title: 'Second site'});
  event(db, a.page.id, 'view'); event(db, a.page.id, 'view');
  for (let i = 0; i < 3; i++) event(db, a.page.id, 'click', one.id);
  event(db, a.page.id, 'click', two.id);
  await archiveLink(await request('/api/pages/' + a.page.id + '/links/' + one.id, {method: 'DELETE'}), a.page.id, one.id);
  const result = await readAnalytics(a.page.id);
  assert.equal(result.totalViews, 2); assert.equal(result.totalClicks, 4); assert.equal(result.clickRate, 200);
  assert.equal(result.ranking[0].id, one.id); assert.equal(result.ranking[0].share, 75);
  assert.equal(result.ranking[0].clickRate, 150); assert.equal(result.ranking[0].archived, true);
  assert.equal(result.ranking[0].enabled, false); assert.equal(result.ranking[0].url, one.url);
  assert.equal(result.ranking[0].icon, 'auto');
  assert.equal(result.daily.reduce((n, day) => n + day.clicks, 0), 4);
});

test('no-view rates are unknown, and visits without clicks produce zero rather than fake engagement', async () => {
  const {db} = setup(), a = await page(), one = await link(a.page.id);
  let result = await readAnalytics(a.page.id);
  assert.equal(result.clickRate, null); assert.equal(result.ranking[0].clickRate, null);
  event(db, a.page.id, 'click', one.id);
  result = await readAnalytics(a.page.id);
  assert.equal(result.clickRate, null, 'a direct tracked link click need not have a corresponding page view');
  const b = await page('b'); await link(b.page.id, {}, 'b'); event(db, b.page.id, 'view');
  result = await readAnalytics(b.page.id, 'range=all', 'b');
  assert.equal(result.totalClicks, 0); assert.equal(result.clickRate, 0); assert.equal(result.ranking[0].clickRate, 0);
});

test('link drilldown filters daily/device/source data and rejects another account’s links', async () => {
  const {db} = setup(), a = await page(), b = await page('b');
  const one = await link(a.page.id), two = await link(a.page.id), foreign = await link(b.page.id, {}, 'b');
  event(db, a.page.id, 'view');
  event(db, a.page.id, 'click', one.id, Date.now(), 'มือถือ', 'LINE');
  event(db, a.page.id, 'click', one.id, Date.now(), 'มือถือ', 'LINE');
  event(db, a.page.id, 'click', two.id, Date.now(), 'คอมพิวเตอร์', 'Facebook');
  event(db, b.page.id, 'view'); event(db, b.page.id, 'click', foreign.id);
  const result = await readAnalytics(a.page.id, 'range=all&linkId=' + one.id);
  assert.equal(result.totalClicks, 3, 'page comparison denominators stay unchanged');
  assert.equal(result.selectedLink.id, one.id); assert.equal(result.selectedLink.clicks, 2);
  assert.equal(result.selectedLink.clickRate, 200); assert.equal(result.selectedLink.share, 66.7);
  assert.deepEqual(result.selectedLink.devices, [{name: 'มือถือ', count: 2}]);
  assert.deepEqual(result.selectedLink.sources, [{name: 'LINE', count: 2}]);
  assert.equal(result.selectedLink.daily.reduce((n, day) => n + day.clicks, 0), 2);
  await assert.rejects(readAnalytics(a.page.id, 'range=all&linkId=' + foreign.id), error => error.status === 404);
  await assert.rejects(readAnalytics(a.page.id, 'range=all', 'b'), error => error.status === 404);
  await assert.rejects(readAnalytics(a.page.id, 'range=all&linkId=bogus'), error => error.status === 400);
});

test('Thai date boundaries and zero-filled days apply to both page and link statistics', async () => {
  const {db} = setup(), a = await page(), one = await link(a.page.id);
  const now = Date.now(), midnight = Math.floor((now + 25200000) / 86400000) * 86400000 - 25200000;
  event(db, a.page.id, 'view', null, midnight - 1);
  event(db, a.page.id, 'view', null, midnight);
  event(db, a.page.id, 'click', one.id, midnight - 1);
  event(db, a.page.id, 'click', one.id, midnight);
  event(db, a.page.id, 'click', one.id, now + 86400000); // future data is excluded.
  const today = await readAnalytics(a.page.id, 'range=today&linkId=' + one.id);
  assert.equal(today.totalViews, 1); assert.equal(today.totalClicks, 1); assert.equal(today.clickRate, 100);
  assert.equal(today.daily.length, 1); assert.equal(today.daily[0].date, new Date(now + 25200000).toISOString().slice(0, 10));
  const week = await readAnalytics(a.page.id, 'range=7d&linkId=' + one.id);
  assert.equal(week.daily.length, 7); assert.equal(week.selectedLink.daily.length, 7);
  assert.equal(week.daily.reduce((n, day) => n + day.clicks, 0), 2);
});

test('view deduplication, owner/bot exclusions and redirect attribution remain intact', async () => {
  const {db} = setup(), a = await page(), one = await link(a.page.id); await publish(a.page.id);
  const viewId = crypto.randomUUID();
  const record = async (actor, headers = {}, id = viewId) => recordView(await request('/api/events', {
    actor, method: 'POST', body: {id, type: 'view', pageId: a.page.id, source: 'instagram'}, headers,
  }));
  await record(null); await record(null); await record('a', {}, crypto.randomUUID());
  await record(null, {'User-Agent': 'facebookexternalhit/1.1'}, crypto.randomUUID());
  await record(null, {'Sec-Purpose': 'prefetch'}, crypto.randomUUID());
  const redirect = await goToLink(await request('/go/owner-a/' + one.id + '?src=line', {actor: null}), 'owner-a', one.id);
  assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('location'), one.url);
  await goToLink(await request('/go/owner-a/' + one.id, {actor: 'a'}), 'owner-a', one.id);
  await goToLink(await request('/go/owner-a/' + one.id, {actor: null, method: 'HEAD'}), 'owner-a', one.id);
  const result = await readAnalytics(a.page.id, 'range=all&linkId=' + one.id);
  assert.equal(result.totalViews, 1); assert.equal(result.totalClicks, 1);
  assert.deepEqual(result.sources, [{name: 'Instagram', count: 1}]);
  assert.deepEqual(result.selectedLink.sources, [{name: 'LINE', count: 1}]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_events').get().n, 2);
});

test('CSV exports selected link rates, Thai text and safe spreadsheet cells', async () => {
  const {db} = setup(), a = await page();
  const one = await link(a.page.id, {title: '=HYPERLINK("https://evil.example")'});
  const two = await link(a.page.id, {title: 'Another link'});
  event(db, a.page.id, 'view'); event(db, a.page.id, 'click', one.id); event(db, a.page.id, 'click', one.id);
  event(db, a.page.id, 'click', two.id);
  const response = await exportAnalytics(await request('/api/pages/' + a.page.id + '/export?range=all&linkId=' + one.id), a.page.id);
  assert.match(response.headers.get('content-type'), /text\/csv/);
  const csv = await response.text();
  assert.match(csv, /คลิกต่อการเข้าชม/); assert.match(csv, /"200"/);
  assert.match(csv, /"'=HYPERLINK/); assert.doesNotMatch(csv, /Another link/);
  assert.match(csv, /ไม่ใช่จำนวนคน/); assert.match(csv, /URL/);
});
