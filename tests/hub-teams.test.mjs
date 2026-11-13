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
const environmentKey = Symbol.for('nakna-hub.teams.environment');
globalThis[environmentKey] = testEnv;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {
      url: 'data:text/javascript,export const env=globalThis[Symbol.for("nakna-hub.teams.environment")];', shortCircuit: true,
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
const {getBillingStatus} = await import('../lib/hub-billing.ts');
const {HUB_THEMES} = await import('../lib/hub-themes.ts');
const ORIGIN = 'https://hub.example.com', CHANNEL = '1234567890';
const ACTORS = ['a', 'b', 'c', 'd'];
const identity = actor => `line:${CHANNEL}:U${actor.repeat(32)}`;
const cookie = actor => actor.repeat(43);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/4N8AAAAASUVORK5CYII=', 'base64');
const databases = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {throw new Error('Unexpected network request in team security tests');};
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

test('Starter owner creates a real named team; only selected owned hubs can be attached', async () => {
  const {db} = setup(), p = await page(), foreign = await page('c');
  assert.equal((await account()).plan, 'starter');
  const t = await team([p.page.id]);
  assert.equal(t.name, 'Content team'); assert.equal(t.isOwner, true);
  assert.deepEqual(t.pages.map(row => row.id), [p.page.id]);
  assert.equal((await teams.listTeams(await request('/api/teams'))).owned.length, 1);
  await assert.rejects(team([foreign.page.id]), deny);
  await assert.rejects(teams.updateTeam(await request('/api/teams/' + t.id,
    {method: 'PATCH', body: {pageIds: [p.page.id, foreign.page.id]}}), t.id), deny);
  assert.deepEqual((await detail(t.id)).pages.map(row => row.id), [p.page.id]);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('outsider cannot inspect, rename, delete, invite to, or attach pages to another team', async () => {
  setup(); const p = await page(), t = await team([p.page.id]);
  assert.deepEqual(await teams.listTeams(await request('/api/teams', {actor: 'c'})), {owned: [], joined: []});
  await assert.rejects(detail(t.id, 'c'), deny);
  await assert.rejects(teams.updateTeam(await request('/api/teams/' + t.id,
    {actor: 'c', method: 'PATCH', body: {name: 'Taken over'}}), t.id), deny);
  await assert.rejects(teams.deleteTeam(await request('/api/teams/' + t.id, {actor: 'c', method: 'DELETE'}), t.id), deny);
  await assert.rejects(invite(t.id, {actor: 'c'}), deny);
  assert.equal((await detail(t.id)).name, 'Content team');
});

test('invitation claim is pending until owner approval and cannot grant a second recipient access', async () => {
  setup(); const p = await page(), t = await team([p.page.id]), i = await invite(t.id);
  await assert.rejects(accept(i.token, null), error => error.status === 401);
  const result = await accept(i.token); assert.equal(result.status, 'pending');
  assert.equal((await workspace('b')).sharedPages.length, 0);
  await assert.rejects(readPage(p.page.id, 'b'), deny);
  await assert.rejects(accept(i.token, 'c'), unavailableInvite);
  await approve(t.id);
  const shared = await readPage(p.page.id, 'b');
  assert.equal(shared.access.role, 'editor'); assert.equal(shared.access.canEdit, true);
  assert.equal(shared.access.canManage, false); assert.equal(shared.access.canPublish, false);
  assert.deepEqual((await workspace('b')).sharedPages.map(row => row.id), [p.page.id]);
  assert.equal((await account('b')).plan, 'starter', 'joining never upgrades the recipient personal account');
  await assert.rejects(readPage(p.page.id, 'c'), deny);
});

test('members cannot approve themselves, increase permissions, invite people or change team scope', async () => {
  setup(); const p = await page(), t = await team([p.page.id]), i = await invite(t.id);
  await accept(i.token); const id = await memberId(t.id);
  const patch = body => request('/api/teams/' + t.id + '/members/' + id, {actor: 'b', method: 'PATCH', body});
  await assert.rejects(teams.updateTeamMember(await patch({action: 'approve', role: 'editor', canPublish: true}), t.id, id), deny);
  await approve(t.id);
  await assert.rejects(teams.updateTeamMember(await patch({action: 'update', role: 'editor', canPublish: true}), t.id, id), deny);
  await assert.rejects(invite(t.id, {actor: 'b'}), deny);
  await assert.rejects(teams.updateTeam(await request('/api/teams/' + t.id,
    {actor: 'b', method: 'PATCH', body: {name: 'Changed by member', pageIds: []}}), t.id), deny);
  assert.equal((await readPage(p.page.id, 'b')).access.canPublish, false);
});

test('viewer can read authorized hub and paid reports but cannot edit content, upload or publish', async () => {
  const {p} = await sharing({role: 'viewer', paidOwner: true}); const r = await revision(p.page.id, 'b');
  assert.equal((await readPage(p.page.id, 'b')).access.canEdit, false);
  assert.equal((await hub.analytics(await request('/api/pages/' + p.page.id + '/analytics', {actor: 'b'}), p.page.id)).totalClicks, 0);
  await assert.rejects(link(p.page.id, {}, 'b'), deny);
  await assert.rejects(hub.updatePage(await request('/api/pages/' + p.page.id,
    {actor: 'b', method: 'PATCH', body: {profile: {name: 'Viewer change'}, revision: r}}), p.page.id), deny);
  await assert.rejects(upload(p.page.id, 'b'), deny);
  await assert.rejects(publish(p.page.id, 'b'), deny);
  await assert.rejects(hub.archivePage(await request('/api/pages/' + p.page.id, {actor: 'b', method: 'DELETE', body: {revision: r}}), p.page.id), deny);
});

test('editor writes drafts for the target owner but publishing requires explicit owner permission', async () => {
  const {db, p, a, t, b} = await sharing();
  const l = await link(p.page.id, {title: 'From teammate'}, 'b');
  assert.equal(db.prepare('SELECT account_id FROM hub_pages WHERE id=?').get(p.page.id).account_id, a.id);
  assert.notEqual(a.id, b.id);
  assert.equal((await readPage(p.page.id)).links.find(row => row.id === l.id).title, 'From teammate');
  await assert.rejects(publish(p.page.id, 'b'), deny);
  const id = await memberId(t.id);
  await teams.updateTeamMember(await request('/api/teams/' + t.id + '/members/' + id,
    {method: 'PATCH', body: {action: 'update', role: 'editor', canPublish: true}}), t.id, id);
  await publish(p.page.id, 'b');
  assert.equal((await readPage(p.page.id)).page.published, true);
  await assert.rejects(hub.archivePage(await request('/api/pages/' + p.page.id,
    {actor: 'b', method: 'DELETE', body: {revision: await revision(p.page.id, 'b')}}), p.page.id), deny);
});

test('revocation and removing a team hub take effect on the very next request', async () => {
  const {p, t} = await sharing({canPublish: true}); const id = await memberId(t.id);
  await teams.revokeTeamMember(await request('/api/teams/' + t.id + '/members/' + id, {method: 'DELETE'}), t.id, id);
  await assert.rejects(readPage(p.page.id, 'b'), deny);
  assert.equal((await workspace('b')).sharedPages.length, 0);
  const next = await invite(t.id); await accept(next.token); await approve(t.id);
  assert.equal((await readPage(p.page.id, 'b')).access.canEdit, true);
  await teams.updateTeam(await request('/api/teams/' + t.id, {method: 'PATCH', body: {pageIds: []}}), t.id);
  await assert.rejects(readPage(p.page.id, 'b'), deny);
});

test('shared access does not expose other hubs belonging to the same owner', async () => {
  const {db, p, a, t} = await sharing({paidOwner: true});
  const privatePage = await page('a', '-private');
  await assert.rejects(readPage(privatePage.page.id, 'b'), deny);
  await assert.rejects(link(privatePage.page.id, {}, 'b'), deny);
  assert.deepEqual((await workspace('b')).sharedPages.map(row => row.id), [p.page.id]);
  await teams.updateTeam(await request('/api/teams/' + t.id,
    {method: 'PATCH', body: {pageIds: [p.page.id, privatePage.page.id]}}), t.id);
  assert.equal((await workspace('b')).sharedPages.length, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_pages WHERE account_id=?').get(a.id).n, 2);
});

test('shared analytics uses the hub owner paid entitlement and never exposes owner billing', async () => {
  const {db, p, a, b} = await sharing();
  paid(db, b.id);
  await assert.rejects(hub.analytics(await request('/api/pages/' + p.page.id + '/analytics', {actor: 'b'}), p.page.id),
    error => error.status === 403 && error.extra?.code === 'analytics_pro_required');
  paid(db, b.id, {status: 'canceled'}); paid(db, a.id);
  assert.equal((await hub.analytics(await request('/api/pages/' + p.page.id + '/analytics', {actor: 'b'}), p.page.id)).totalViews, 0);
  assert.equal((await readPage(p.page.id, 'b')).access.analytics, true);
  const billing = await getBillingStatus(await request('/api/billing?accountId=' + a.id, {actor: 'b'}));
  assert.equal(billing.plan, 'starter');
  assert.equal(billing.subscription.status, 'canceled', 'billing is scoped to the actor, not target hub owner');
  paid(db, a.id, {until: Date.now() - 1});
  await assert.rejects(hub.analytics(await request('/api/pages/' + p.page.id + '/analytics', {actor: 'b'}), p.page.id),
    error => error.status === 403 && error.extra?.code === 'analytics_pro_required');
});

test('teammate media is owned by the target account and private media stays scoped to authorized hubs', async () => {
  const {db, p, a, t} = await sharing({paidOwner: true});
  const privatePage = await page('a', '-private'), privateAsset = await upload(privatePage.page.id);
  await link(privatePage.page.id, {icon: 'image:' + privateAsset.url.slice(7)});
  const sharedAsset = await upload(p.page.id, 'b');
  await link(p.page.id, {icon: 'image:' + sharedAsset.url.slice(7)}, 'b');
  assert.equal(db.prepare('SELECT account_id FROM hub_assets WHERE id=?').get(sharedAsset.url.slice(7)).account_id, a.id);
  assert.equal((await hub.serveAsset(await request(sharedAsset.url, {actor: 'b'}), sharedAsset.url.slice(7))).status, 200);
  await assert.rejects(hub.serveAsset(await request(sharedAsset.url, {actor: 'c'}), sharedAsset.url.slice(7)), deny);
  await assert.rejects(hub.serveAsset(await request(privateAsset.url, {actor: 'b'}), privateAsset.url.slice(7)), deny);
  await assert.rejects(link(p.page.id, {icon: 'image:' + privateAsset.url.slice(7)}, 'b'), error => [400, 403, 404].includes(error.status));
  const id = await memberId(t.id);
  await teams.revokeTeamMember(await request('/api/teams/' + t.id + '/members/' + id, {method: 'DELETE'}), t.id, id);
  await assert.rejects(hub.serveAsset(await request(sharedAsset.url, {actor: 'b'}), sharedAsset.url.slice(7)), deny);
});

test('client revisions prevent stale team edits from overwriting a newer change', async () => {
  const {p} = await sharing(); const l = await link(p.page.id);
  const oldRevision = await revision(p.page.id, 'b');
  await hub.updateLink(await request('/api/pages/' + p.page.id + '/links/' + l.id,
    {method: 'PATCH', body: {title: 'Owner latest', revision: oldRevision}}), p.page.id, l.id);
  await assert.rejects(hub.updateLink(await request('/api/pages/' + p.page.id + '/links/' + l.id,
    {actor: 'b', method: 'PATCH', body: {title: 'Teammate stale', revision: oldRevision}}), p.page.id, l.id), conflict);
  assert.equal((await readPage(p.page.id)).links.find(row => row.id === l.id).title, 'Owner latest');
  await assert.rejects(hub.updateLink(await request('/api/pages/' + p.page.id + '/links/' + l.id,
    {actor: 'b', method: 'PATCH', body: {title: 'No version supplied'}}), p.page.id, l.id), error => [400, 409, 428].includes(error.status));
});

test('all team mutations reject missing or foreign Origin and forged session identity', async () => {
  setup(); const p = await page(), t = await team([p.page.id]), i = await invite(t.id);
  for (const headers of [{Origin: ''}, {Origin: 'https://evil.example'}, {'Sec-Fetch-Site': 'cross-site'}]) {
    await assert.rejects(teams.createTeam(await request('/api/teams', {method: 'POST', headers, body: {name: 'Forged', pageIds: [p.page.id]}})), error => error.status === 403);
    await assert.rejects(teams.acceptTeamInvite(await request('/api/team-invites/' + i.token,
      {actor: 'b', method: 'POST', headers, body: {}}), i.token), error => error.status === 403);
  }
  await assert.rejects(teams.createTeam(await request('/api/teams', {actor: null, method: 'POST',
    headers: {'oai-authenticated-user-id': identity('a')}, body: {name: 'Forged', pageIds: [p.page.id]}})), error => error.status === 401);
});

test('invites store only a token hash, enforce expiration and revoke unused and pending access', async () => {
  const {db} = setup(), p = await page(), t = await team([p.page.id]), i = await invite(t.id);
  const row = db.prepare('SELECT * FROM hub_team_invites WHERE id=?').get(i.inviteId);
  assert.equal(row.token_hash, createHash('sha256').update(i.token).digest('hex'));
  assert.notEqual(row.token_hash, i.token);
  assert.equal(row.expires_at - row.created_at, 7 * 86400000);
  assert.equal(JSON.stringify(row).includes(i.token), false, 'raw secret is absent from stored invitation');
  assert.doesNotMatch(JSON.stringify(await detail(t.id)), /token_hash|line:1234567890|TEST_TEAMS_SECRET/);
  db.prepare('UPDATE hub_team_invites SET expires_at=? WHERE id=?').run(Date.now() - 1, i.inviteId);
  await assert.rejects(accept(i.token), unavailableInvite);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_team_members').get().n, 0);
  const revoked = await invite(t.id);
  await teams.revokeTeamInvite(await request('/api/teams/' + t.id + '/invites/' + revoked.inviteId, {method: 'DELETE'}), t.id, revoked.inviteId);
  await assert.rejects(accept(revoked.token), unavailableInvite);
  const pending = await invite(t.id); await accept(pending.token);
  const id = await memberId(t.id);
  await teams.revokeTeamInvite(await request('/api/teams/' + t.id + '/invites/' + pending.inviteId, {method: 'DELETE'}), t.id, pending.inviteId);
  await assert.rejects(teams.updateTeamMember(await request('/api/teams/' + t.id + '/members/' + id,
    {method: 'PATCH', body: {action: 'approve'}}), t.id, id), unavailableInvite);
  await assert.rejects(readPage(p.page.id, 'b'), deny);
});

test('concurrent invitation claims bind exactly one account and never grant active access automatically', async () => {
  const {db} = setup(), p = await page(), t = await team([p.page.id]), i = await invite(t.id);
  const results = await Promise.allSettled([accept(i.token, 'b'), accept(i.token, 'c')]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  const rows = db.prepare('SELECT account_id,status FROM hub_team_members WHERE team_id=?').all(t.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'pending');
  assert.equal(db.prepare('SELECT claimed_account_id FROM hub_team_invites WHERE id=?').get(i.inviteId).claimed_account_id, rows[0].account_id);
  await assert.rejects(readPage(p.page.id, 'b'), deny);
  await assert.rejects(readPage(p.page.id, 'c'), deny);
});

test('revoking a team preserves hubs and revokes every shared path immediately', async () => {
  const {db, p, t} = await sharing({canPublish: true});
  const unused = await invite(t.id);
  await teams.deleteTeam(await request('/api/teams/' + t.id, {method: 'DELETE'}), t.id);
  await assert.rejects(readPage(p.page.id, 'b'), deny);
  await assert.rejects(accept(unused.token, 'c'), unavailableInvite);
  assert.equal((await readPage(p.page.id)).page.id, p.page.id);
  assert.equal(db.prepare('SELECT archived FROM hub_pages WHERE id=?').get(p.page.id).archived, 0);
  assert.equal((await teams.listTeams(await request('/api/teams', {actor: 'b'}))).joined.length, 0);
});

test('role validation prevents publishing viewers and member promotion to platform or owner privileges', async () => {
  setup(); const p = await page(), t = await team([p.page.id]);
  for (const body of [{role: 'owner', canPublish: true}, {role: 'operator', canPublish: true}, {role: 'editor', canPublish: 'true'}]) {
    await assert.rejects(teams.createTeamInvite(await request('/api/teams/' + t.id + '/invites', {method: 'POST', body}), t.id), error => error.status === 400);
  }
  const i = await invite(t.id); await accept(i.token); await approve(t.id); const id = await memberId(t.id);
  await assert.rejects(teams.updateTeamMember(await request('/api/teams/' + t.id + '/members/' + id,
    {method: 'PATCH', body: {action: 'update', role: 'owner', canPublish: true}}), t.id, id), error => error.status === 400);
  await assert.rejects(hub.requireOperator(await request('/api/operator', {actor: 'b'})), error => error.status === 403);
  assert.equal(Object.hasOwn((await workspace('b')).account, 'isOperator'), false);
});

test('audit records the editing teammate separately from owner and internal clicks do not pollute analytics', async () => {
  const {db, p, t, a, b} = await sharing({canPublish: true});
  const l = await link(p.page.id, {title: 'Team action'}, 'b'); await publish(p.page.id);
  const events = db.prepare('SELECT * FROM hub_team_audit WHERE page_id=? AND actor_account_id=?').all(p.page.id, b.id);
  assert.ok(events.length > 0, 'content activity is attributed to the acting teammate');
  assert.notEqual(events[0].actor_account_id, a.id);
  assert.equal(events[0].team_id, t.id);
  const visit = actor => request('/api/events', {actor, method: 'POST', body: {type: 'view', pageId: p.page.id, id: crypto.randomUUID()}, headers: {'User-Agent': 'Mozilla/5.0'}}).then(hub.recordView);
  const click = actor => request('/go/owner-a/' + l.id, {actor, headers: {'User-Agent': 'Mozilla/5.0'}}).then(r => hub.goToLink(r, 'owner-a', l.id));
  await visit('a'); await visit('b'); await click('a'); await click('b');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_events WHERE page_id=?').get(p.page.id).n, 0);
  await visit(null); await click(null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_events WHERE page_id=?').get(p.page.id).n, 2);
});

test('active permissions can be changed after old invite revocation and invitation preview reflects current role', async () => {
  const {p, t, i} = await sharing({canPublish: true}); const id = await memberId(t.id);
  await teams.revokeTeamInvite(await request('/api/teams/' + t.id + '/invites/' + i.inviteId, {method: 'DELETE'}), t.id, i.inviteId);
  await teams.updateTeamMember(await request('/api/teams/' + t.id + '/members/' + id,
    {method: 'PATCH', body: {action: 'update', role: 'viewer', canPublish: false}}), t.id, id);
  const editor = await readPage(p.page.id, 'b');
  assert.equal(editor.access.role, 'viewer'); assert.equal(editor.access.canEdit, false); assert.equal(editor.access.canPublish, false);
  const preview = await teams.getTeamInvite(await request('/api/team-invites/' + i.token, {actor: 'b'}), i.token);
  assert.equal(preview.role, 'viewer'); assert.equal(preview.canPublish, false);
});

test('one recipient racing two invitations does not consume the losing unused invitation', async () => {
  const {db} = setup(), p = await page(), t = await team([p.page.id]);
  const first = await invite(t.id), second = await invite(t.id);
  const results = await Promise.allSettled([accept(first.token), accept(second.token)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_team_members WHERE team_id=?').get(t.id).n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_team_invites WHERE team_id=? AND claimed_account_id IS NOT NULL').get(t.id).n, 1);
});

test('membership and invitation identifiers cannot be substituted across teams', async () => {
  setup(); const ownPage = await page(), otherPage = await page('c');
  const own = await team([ownPage.page.id]), other = await team([otherPage.page.id], 'c');
  const i = await invite(other.id, {actor: 'c'}); await accept(i.token, 'd');
  const recipientId = (await account('d')).id;
  const foreign = (await detail(other.id, 'c')).members.find(row => row.accountId === recipientId);
  assert.ok(foreign);
  await assert.rejects(teams.updateTeamMember(await request('/api/teams/' + own.id + '/members/' + foreign.id,
    {method: 'PATCH', body: {action: 'approve'}}), own.id, foreign.id), deny);
  await assert.rejects(teams.revokeTeamMember(await request('/api/teams/' + own.id + '/members/' + foreign.id,
    {method: 'DELETE'}), own.id, foreign.id), deny);
  await assert.rejects(teams.revokeTeamInvite(await request('/api/teams/' + own.id + '/invites/' + i.inviteId,
    {method: 'DELETE'}), own.id, i.inviteId), deny);
  assert.equal((await detail(other.id, 'c')).members.find(row => row.id === foreign.id).status, 'pending');
});

test('legacy unscoped owner media is usable only when attached to the authorized hub', async () => {
  const {p} = await sharing({paidOwner: true});
  const privatePage = await page('a', '-legacy-private');
  const privateAsset = await upload(null), sharedAsset = await upload(null);
  await link(privatePage.page.id, {icon: 'image:' + privateAsset.url.slice(7)});
  await link(p.page.id, {icon: 'image:' + sharedAsset.url.slice(7)});
  assert.equal((await hub.serveAsset(await request(sharedAsset.url, {actor: 'b'}), sharedAsset.url.slice(7))).status, 200);
  await assert.rejects(hub.serveAsset(await request(privateAsset.url, {actor: 'b'}), privateAsset.url.slice(7)), deny);
  await assert.rejects(link(p.page.id, {icon: 'image:' + privateAsset.url.slice(7)}, 'b'), error => error.status === 400);
});

test('revocation during R2 upload rejects the asset insert and removes the stored object', async () => {
  const {db, objects, p, t} = await sharing();
  const id = await memberId(t.id);
  const before = db.prepare('SELECT COUNT(*) AS n FROM hub_assets').get().n;
  const put = testEnv.BUCKET.put.bind(testEnv.BUCKET);
  testEnv.BUCKET.put = async (...args) => {
    await put(...args);
    await teams.revokeTeamMember(await request('/api/teams/' + t.id + '/members/' + id, {method: 'DELETE'}), t.id, id);
  };
  await assert.rejects(upload(p.page.id, 'b'), error => error.status === 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_assets').get().n, before, 'revoked uploader cannot insert an owner-scoped asset');
  assert.equal(objects.size, 0, 'the R2 object written before revocation is cleaned up');
  await assert.rejects(readPage(p.page.id, 'b'), deny);
});

test('Starter allows five combined links and headings; disabled items count and archived items release a slot', async () => {
  setup(); const p = await page(), id = p.page.id;
  const first = await link(id, {enabled: false});
  for (let i = 0; i < 3; i++) await link(id, {title: 'Link ' + i});
  await link(id, {type: 'heading', title: 'Our work'});
  assert.equal((await workspace('a')).limits.maxLinksPerPage, 5);
  assert.equal((await readPage(id)).links.filter(item => !item.archived).length, 5);
  await assert.rejects(link(id, {title: 'Sixth item'}), error => [403, 409].includes(error.status));
  const archive = async item => hub.archiveLink(await request(`/api/pages/${id}/links/${item.id}?revision=${await revision(id)}`,
    {method: 'DELETE'}), id, item.id);
  const restore = async item => hub.updateLink(await request(`/api/pages/${id}/links/${item.id}`,
    {method: 'PATCH', body: {archived: false, revision: await revision(id)}}), id, item.id);
  await archive(first);
  const replacement = await link(id, {title: 'Replacement'});
  await assert.rejects(restore(first), error => [403, 409].includes(error.status));
  assert.equal((await readPage(id)).links.find(item => item.id === first.id).archived, true);
  await archive(replacement);
  await restore(first);
  const saved = await readPage(id);
  assert.equal(saved.links.filter(item => !item.archived).length, 5);
  assert.equal(saved.links.find(item => item.id === first.id).enabled, false);
  assert.equal(saved.links.find(item => item.id === replacement.id).archived, true);
});

test('shared editors use the hub owner limit regardless of the editor own paid plan', async () => {
  const {db, p, a, b} = await sharing();
  paid(db, b.id);
  for (let i = 0; i < 5; i++) await link(p.page.id, {title: 'Shared ' + i}, 'b');
  assert.equal((await readPage(p.page.id, 'b')).access.plan, 'starter');
  await assert.rejects(link(p.page.id, {title: 'Editor Pro cannot expand Starter owner'}, 'b'),
    error => [403, 409].includes(error.status));
  paid(db, b.id, {status: 'canceled'}); paid(db, a.id);
  assert.equal((await account('b')).plan, 'starter');
  await link(p.page.id, {title: 'Pro owner sixth item'}, 'b');
  assert.equal((await readPage(p.page.id, 'b')).access.plan, 'pro');
  assert.equal((await readPage(p.page.id, 'b')).links.filter(item => !item.archived).length, 6);
  assert.equal((await workspace('a')).limits.maxLinksPerPage, 100);
});

test('ready-made theme persists as a draft, preserves content and media, and reaches the public hub only on publish', async () => {
  setup(); const p = await page(), id = p.page.id;
  const asset = await upload(id);
  const originalLink = await link(id, {title: 'My original link', icon: 'image:' + asset.url.slice(7)});
  const save = async profile => hub.updatePage(await request('/api/pages/' + id,
    {method: 'PATCH', body: {profile, revision: await revision(id)}}), id);
  await save({name: 'My brand', handle: '@my-brand', bio: 'My own introduction', avatarUrl: asset.url});
  await publish(id);
  const publicHub = () => request('/api/hubs/' + p.page.slug, {actor: null}).then(r => hub.getPublicHub(r, p.page.slug));
  const legacy = await publicHub();
  assert.equal(legacy.profile.themeId, undefined, 'legacy profiles do not receive a new style implicitly');
  const preset = HUB_THEMES.find(theme => theme.category === 'glass');
  assert.ok(preset);
  const saved = await save({themeId: preset.id});
  const expected = {...legacy.profile, themeId: preset.id, ...preset.profile};
  assert.deepEqual(saved.profile, expected, 'themeId-only applies the complete design without replacing personal content');
  assert.deepEqual((await readPage(id)).profile, expected);
  assert.equal(saved.page.hasUnpublishedChanges, true);
  assert.deepEqual((await publicHub()).profile, legacy.profile, 'choosing and saving a theme cannot change the published snapshot');
  await publish(id);
  const published = await publicHub();
  assert.deepEqual(published.profile, expected);
  assert.equal(published.links[0].id, originalLink.id);
  assert.equal(published.links[0].title, 'My original link');
  assert.equal(published.links[0].icon, originalLink.icon);
  assert.equal(published.profile.showBranding, true);
});

test('theme presets support validated appearance overrides and returning to custom styling', async () => {
  setup(); const p = await page(), id = p.page.id, preset = HUB_THEMES[0];
  const save = async profile => hub.updatePage(await request('/api/pages/' + id,
    {method: 'PATCH', body: {profile, revision: await revision(id)}}), id);
  const chosen = await save({themeId: preset.id, accent: '#123456', layout: 'grid'});
  assert.equal(chosen.profile.themeId, preset.id);
  assert.equal(chosen.profile.accent, '#123456');
  assert.equal(chosen.profile.layout, 'grid');
  const edited = await save({bio: 'Only my introduction changed'});
  assert.equal(edited.profile.themeId, preset.id);
  assert.equal(edited.profile.accent, '#123456', 'later partial saves do not reset appearance overrides');
  const custom = await save({themeId: 'custom', theme: 'dark', background: 'ink', accent: '#654321'});
  assert.equal(custom.profile.themeId, 'custom');
  assert.equal(custom.profile.theme, 'dark');
  assert.equal(custom.profile.background, 'ink');
  assert.equal(custom.profile.accent, '#654321');
  assert.equal(custom.profile.bio, 'Only my introduction changed');
  assert.deepEqual((await readPage(id)).profile, custom.profile);
});

test('unrecognized themes and injected design properties are rejected without changing the stored draft', async () => {
  setup(); const p = await page(), id = p.page.id, before = await readPage(id);
  const save = profile => request('/api/pages/' + id,
    {method: 'PATCH', body: {profile, revision: before.revision}}).then(r => hub.updatePage(r, id));
  for (const themeId of [null, {}, [], '', 'unknown-theme', 'constructor', '__proto__', 'url(https://evil.example/track)']) {
    await assert.rejects(save({themeId}), error => error.status === 400);
  }
  await assert.rejects(save({themeId: HUB_THEMES[0].id, backgroundImage: 'url(https://evil.example/track)'}), error => error.status === 400);
  await assert.rejects(save({themeId: HUB_THEMES[0].id, accent: 'url(https://evil.example/track)'}), error => error.status === 400);
  const after = await readPage(id);
  assert.deepEqual(after.profile, before.profile);
  assert.equal(after.revision, before.revision);
});

test('theme edits respect shared editor permissions and the owner branding entitlement', async () => {
  const {db, p, a, b, t} = await sharing(), id = p.page.id;
  const save = async (profile, actor = 'b') => hub.updatePage(await request('/api/pages/' + id,
    {actor, method: 'PATCH', body: {profile, revision: await revision(id, actor)}}), id);
  paid(db, b.id);
  const chosen = await save({themeId: HUB_THEMES[0].id});
  assert.equal(chosen.profile.themeId, HUB_THEMES[0].id);
  assert.equal(chosen.access.plan, 'starter');
  assert.equal(chosen.profile.showBranding, true);
  await assert.rejects(save({themeId: HUB_THEMES[1].id, showBranding: false}),
    error => error.status === 403 && error.extra?.code === 'pro_required');
  assert.equal((await readPage(id)).profile.themeId, HUB_THEMES[0].id);
  await assert.rejects(publish(id, 'b'), deny);
  paid(db, a.id);
  await save({showBranding: false}, 'a');
  assert.equal((await save({themeId: HUB_THEMES[1].id})).profile.showBranding, false,
    'switching designs preserves branding removal already authorized by the owner plan');
  const member = await memberId(t.id);
  await teams.updateTeamMember(await request('/api/teams/' + t.id + '/members/' + member,
    {method: 'PATCH', body: {action: 'update', role: 'viewer', canPublish: false}}), t.id, member);
  await assert.rejects(save({themeId: HUB_THEMES[0].id}), deny);
  assert.equal((await readPage(id)).profile.themeId, HUB_THEMES[1].id);
});
