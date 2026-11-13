import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {authenticateLineRequest, handleLineAuthRequest, lineConfiguration} from '../lib/line-auth.ts';

const ORIGIN = 'https://hub.example.com';
const CHANNEL = '1234567890';
const LINE_USER = `U${'a'.repeat(32)}`;
const NOW = Date.parse('2026-11-12T12:00:00Z');
const OAUTH_COOKIE = '__Host-nakna_line_oauth';
const SESSION_COOKIE = '__Host-nakna_session';
const hash = value => createHash('sha256').update(value).digest('hex');

function database() {
  const sql = new DatabaseSync(':memory:');
  const migrations = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const prepare = query => ({
    query, values: [],
    bind(...values) { return {...this, values}; },
    async first() { return sql.prepare(this.query).get(...this.values) ?? null; },
    async run() { const result = sql.prepare(this.query).run(...this.values); return {success: true, meta: {changes: Number(result.changes)}}; },
  });
  return {
    sql,
    prepare,
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
}
function env(db, extra = {}) { return {DB: db, APP_ORIGIN: ORIGIN, LINE_LOGIN_CHANNEL_ID: CHANNEL, LINE_LOGIN_CHANNEL_SECRET: 'test-secret-for-local-mocks-only', ...extra}; }
function cookies(response) { return response.headers.getSetCookie().map(value => value.split(';', 1)[0]).filter(value => !value.endsWith('=')); }
function request(path, cookieHeader = '', init = {}) {
  return new Request(`${ORIGIN}${path}`, {...init, headers: {...(cookieHeader ? {Cookie: cookieHeader} : {}), ...init.headers}});
}
async function start(db, extra = {}, returnTo = '/studio') {
  const response = await handleLineAuthRequest(request(`/auth/line/start?returnTo=${encodeURIComponent(returnTo)}`), env(db, extra), {now: () => NOW});
  assert.equal(response.status, 303);
  const url = new URL(response.headers.get('location'));
  return {response, url, cookie: cookies(response).join('; '), state: url.searchParams.get('state')};
}
function mockLine(flow, overrides = {}) {
  const calls = [];
  return {
    calls,
    fetcher: async (url, init) => {
      calls.push({url, init});
      assert.equal(init.redirect, 'manual');
      if (url.endsWith('/token')) {
        const body = new URLSearchParams(init.body);
        assert.equal(body.get('client_id'), CHANNEL);
        assert.equal(body.get('redirect_uri'), `${ORIGIN}/auth/line/callback`);
        assert.equal(body.get('grant_type'), 'authorization_code');
        const verifier = body.get('code_verifier');
        assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        if (challenge !== flow.url.searchParams.get('code_challenge') || overrides.pkceRejected) return Response.json({error: 'invalid_grant'}, {status: 400});
        if (overrides.tokenFailure) return Response.json({error: 'invalid_grant'}, {status: 400});
        return Response.json({id_token: 'verified-by-mocked-LINE', access_token: 'mock-access-token'});
      }
      if (url.endsWith('/verify')) {
        const body = new URLSearchParams(init.body);
        assert.equal(body.get('nonce'), flow.url.searchParams.get('nonce'));
        assert.equal(body.get('client_id'), CHANNEL);
        if (overrides.verifyFailure) return Response.json({error: 'invalid_token'}, {status: 400});
        return Response.json({iss: 'https://access.line.me', aud: CHANNEL, sub: LINE_USER,
          exp: NOW / 1000 + 3600, iat: NOW / 1000, nonce: flow.url.searchParams.get('nonce'), name: 'นอต นากนะ', ...overrides.claims});
      }
      if (url.endsWith('/friendship/v1/status')) {
        assert.equal(init.headers.Authorization, 'Bearer mock-access-token');
        if (overrides.friendFailure) throw new Error('mock unreachable');
        return Response.json({friendFlag: overrides.friendFlag ?? true});
      }
      throw new Error(`Unexpected mock endpoint ${url}`);
    },
  };
}
async function finish(db, flow, mock, extra = {}) {
  return handleLineAuthRequest(request(`/auth/line/callback?code=one-time-code&state=${flow.state}`, flow.cookie), env(db, extra), {now: () => NOW, fetcher: mock.fetcher});
}

test('configuration requires canonical HTTPS origin and real channel config', () => {
  assert.equal(lineConfiguration({}), null);
  for (const origin of ['http://hub.example.com', `${ORIGIN}/subpath`, `${ORIGIN}?x=1`, 'https://u:p@hub.example.com']) assert.equal(lineConfiguration(env(undefined, {APP_ORIGIN: origin})), null);
  assert.equal(lineConfiguration(env(undefined)).callbackUrl, `${ORIGIN}/auth/line/callback`);
});

test('start uses PKCE, nonce, browser-bound hash and secure cookie; never requires email', async () => {
  const db = database(), flow = await start(db);
  assert.equal(flow.url.origin, 'https://access.line.me');
  assert.equal(flow.url.searchParams.get('scope'), 'openid profile');
  assert.equal(flow.url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(flow.state, /^[0-9a-f]{64}$/);
  assert.match(flow.response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(flow.response.headers.get('referrer-policy'), 'no-referrer');
  const row = db.sql.prepare('SELECT * FROM hub_line_auth_attempts').get();
  assert.equal(row.state_hash, hash(flow.state));
  assert.equal(row.origin, ORIGIN);
  assert.equal(row.login_channel_id, CHANNEL);
  assert.equal(row.expires_at - row.created_at, 600000);
  assert.notEqual(row.browser_hash, flow.cookie.split('=')[1]);
  assert.equal(flow.url.searchParams.get('bot_prompt'), null);
});

test('add-friend prompt is optional and only enabled for allowed OA links', async () => {
  const good = await start(database(), {LINE_OFFICIAL_ACCOUNT_URL: 'https://line.me/R/ti/p/@nakna-hub'});
  assert.equal(good.url.searchParams.get('bot_prompt'), 'normal');
  const bad = await start(database(), {LINE_OFFICIAL_ACCOUNT_URL: 'https://evil.example/@nakna-hub'});
  assert.equal(bad.url.searchParams.get('bot_prompt'), null);
});

test('returnTo cannot redirect off-site or into unrelated local endpoints', async () => {
  for (const returnTo of ['//evil.example', 'https://evil.example', '/api/operator', '/studio/../../auth/logout', '/\\evil.example', '/studio#bad', '/administer', '/admin/../api/operator', '/admin#bad']) {
    const db = database();
    await handleLineAuthRequest(request(`/auth/line/start?returnTo=${encodeURIComponent(returnTo)}`), env(db), {now: () => NOW});
    assert.equal(db.sql.prepare('SELECT return_to FROM hub_line_auth_attempts').get().return_to, '/studio');
  }
});

test('operator sign-in returns directly to its separate console', async () => {
  const db = database(), flow = await start(db, {}, '/admin?tab=hubs');
  assert.equal(db.sql.prepare('SELECT return_to FROM hub_line_auth_attempts').get().return_to, '/admin?tab=hubs');
  const result = await finish(db, flow, mockLine(flow));
  assert.equal(result.headers.get('location'), '/admin?tab=hubs');
});

test('operator cancellation and token failure stay on the operator console', async () => {
  for (const cancellation of [true, false]) {
    const db = database(), flow = await start(db, {}, '/admin');
    const result = cancellation
      ? await handleLineAuthRequest(request(`/auth/line/callback?error=access_denied&state=${flow.state}`, flow.cookie), env(db), {now: () => NOW})
      : await finish(db, flow, {fetcher: async () => Response.json({error: 'invalid_grant'}, {status: 400})});
    assert.equal(result.headers.get('location'), `/admin?auth_error=${cancellation ? 'line_denied' : 'line_unavailable'}`);
  }
});

test('team invitation survives successful LINE login and a recoverable cancellation', async () => {
  const token = 'I'.repeat(43), destination = `/studio?invite=${token}`;
  const db = database(), flow = await start(db, {}, destination);
  assert.equal((await finish(db, flow, mockLine(flow))).headers.get('location'), destination);
  const retryDb = database(), retry = await start(retryDb, {}, destination);
  const result = await handleLineAuthRequest(request(`/auth/line/callback?error=access_denied&state=${retry.state}`, retry.cookie), env(retryDb), {now: () => NOW});
  const target = new URL(result.headers.get('location'), ORIGIN);
  assert.equal(target.pathname, '/studio');
  assert.equal(target.searchParams.get('invite'), token);
  assert.equal(target.searchParams.get('auth_error'), 'line_denied');
});

test('verified LINE identity creates hashed session without fake email or account auto-link', async () => {
  const db = database(), flow = await start(db), mock = mockLine(flow);
  const response = await finish(db, flow, mock);
  assert.equal(response.headers.get('location'), '/studio');
  const sessionCookie = cookies(response).find(c => c.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(sessionCookie);
  const row = db.sql.prepare('SELECT * FROM hub_line_sessions').get();
  assert.equal(row.token_hash, hash(sessionCookie.split('=')[1]));
  assert.equal(row.email, '');
  assert.equal(row.user_id, `line:${CHANNEL}:${LINE_USER}`);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_auth_attempts').get().n, 0);
  const authenticated = await authenticateLineRequest(request('/api/workspace', sessionCookie, {headers: {'oai-authenticated-user-email': 'forged@example.com'}}), env(db), NOW);
  assert.equal(authenticated.headers.get('oai-authenticated-user-id'), row.user_id);
  assert.equal(authenticated.headers.get('oai-authenticated-user-email'), null);
  assert.equal(decodeURIComponent(authenticated.headers.get('oai-authenticated-user-full-name')), 'นอต นากนะ');
  assert.equal(authenticated.headers.get('oai-authenticated-auth-provider'), 'line');
  assert.equal(db.sql.prepare('SELECT friend_status FROM hub_line_connections').get().friend_status, 'following');
  assert.ok(!JSON.stringify([...db.sql.prepare('SELECT * FROM hub_line_sessions').all()]).includes('mock-access-token'));
});

test('mismatched cookie and altered state cannot consume someone else’s login attempt', async () => {
  const db = database(), flow = await start(db), mock = mockLine(flow);
  for (const [state, header] of [[flow.state, `${OAUTH_COOKIE}=${'Z'.repeat(43)}`], ['0'.repeat(64), flow.cookie], [flow.state, '']]) {
    const result = await handleLineAuthRequest(request(`/auth/line/callback?code=x&state=${state}`, header), env(db), {now: () => NOW, fetcher: mock.fetcher});
    assert.match(result.headers.get('location'), /line_state_invalid/);
  }
  assert.equal(mock.calls.length, 0);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_auth_attempts').get().n, 1);
});

test('expired state and duplicated query state are rejected before LINE requests', async () => {
  const db = database(), flow = await start(db), mock = mockLine(flow);
  const expired = await handleLineAuthRequest(request(`/auth/line/callback?code=x&state=${flow.state}`, flow.cookie), env(db), {now: () => NOW + 600001, fetcher: mock.fetcher});
  assert.match(expired.headers.get('location'), /line_state_invalid/);
  const duplicate = await handleLineAuthRequest(request(`/auth/line/callback?code=x&state=${flow.state}&state=${flow.state}`, flow.cookie), env(db), {now: () => NOW, fetcher: mock.fetcher});
  assert.match(duplicate.headers.get('location'), /line_state_invalid/);
  assert.equal(mock.calls.length, 0);
});

test('state is single use, including simultaneous callback replay', async () => {
  const db = database(), flow = await start(db), mock = mockLine(flow);
  const result = await Promise.all([finish(db, flow, mock), finish(db, flow, mock)]);
  assert.equal(result.filter(r => r.headers.get('location') === '/studio').length, 1);
  assert.equal(result.filter(r => r.headers.get('location').includes('line_state_invalid')).length, 1);
  assert.equal(mock.calls.filter(c => c.url.endsWith('/token')).length, 1);
});

test('user cancellation consumes its state and returns a friendly static code', async () => {
  const db = database(), flow = await start(db), mock = mockLine(flow);
  const result = await handleLineAuthRequest(request(`/auth/line/callback?error=access_denied&error_description=secret&state=${flow.state}`, flow.cookie), env(db), {now: () => NOW, fetcher: mock.fetcher});
  assert.equal(result.headers.get('location'), '/studio?auth_error=line_denied');
  assert.equal(mock.calls.length, 0);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_auth_attempts').get().n, 0);
});

for (const [label, claims] of Object.entries({nonce: {nonce: 'wrong'}, audience: {aud: '9876543210'}, issuer: {iss: 'https://evil.example'}, subject: {sub: 'someone'}, expiry: {exp: NOW / 1000 - 1}, issuance: {iat: NOW / 1000 + 300}})) {
  test(`verified response with incorrect ${label} never creates a session`, async () => {
    const db = database(), flow = await start(db), mock = mockLine(flow, {claims});
    const response = await finish(db, flow, mock);
    assert.equal(response.headers.get('location'), '/studio?auth_error=line_invalid_identity');
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_sessions').get().n, 0);
  });
}

for (const label of ['pkceRejected', 'verifyFailure', 'tokenFailure']) {
  test(`LINE ${label} fails closed and cannot replay the consumed state`, async () => {
    const db = database(), flow = await start(db), mock = mockLine(flow, {[label]: true});
    const response = await finish(db, flow, mock);
    assert.equal(response.headers.get('location'), '/studio?auth_error=line_unavailable');
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_sessions').get().n, 0);
    const replay = await finish(db, flow, mock);
    assert.match(replay.headers.get('location'), /line_state_invalid/);
  });
}

test('friendship failure never prevents login or overwrites newer unfollow state', async () => {
  const db = database(), flow = await start(db);
  db.sql.prepare('INSERT INTO hub_line_connections VALUES (?,?,?,?,?,?,?)').run(`line:${CHANNEL}:${LINE_USER}`, LINE_USER, CHANNEL, 'not_following', NOW + 5000, NOW, NOW + 5000);
  const response = await finish(db, flow, mockLine(flow, {friendFlag: true}));
  assert.equal(response.headers.get('location'), '/studio');
  assert.equal(db.sql.prepare('SELECT friend_status FROM hub_line_connections').get().friend_status, 'not_following');
  const flow2 = await start(db);
  const response2 = await finish(db, flow2, mockLine(flow2, {friendFailure: true}));
  assert.equal(response2.headers.get('location'), '/studio');
  assert.equal(db.sql.prepare('SELECT friend_status FROM hub_line_connections').get().friend_status, 'not_following');
});

for (const elapsed of [0, 5000]) test(`unfollow during friendship HTTP wins over stale following, including a ${elapsed}ms timestamp difference`, async () => {
  const db = database(), flow = await start(db), mock = mockLine(flow);
  let current = NOW;
  const fetcher = async (url, init) => {
    if (url.endsWith('/friendship/v1/status')) {
      current += elapsed;
      db.sql.prepare('INSERT INTO hub_line_connections VALUES (?,?,?,?,?,?,?)').run(`line:${CHANNEL}:${LINE_USER}`, LINE_USER, CHANNEL, 'not_following', current, current, current);
    }
    return mock.fetcher(url, init);
  };
  const response = await handleLineAuthRequest(request(`/auth/line/callback?code=x&state=${flow.state}`, flow.cookie), env(db), {now: () => current, fetcher});
  assert.equal(response.headers.get('location'), '/studio');
  const connection = db.sql.prepare('SELECT * FROM hub_line_connections').get();
  assert.equal(connection.friend_status, 'not_following');
  assert.equal(connection.friendship_checked_at, NOW + elapsed);
  assert.equal(db.sql.prepare('SELECT created_at FROM hub_line_sessions').get().created_at, NOW + elapsed);
});

test('wrong-channel and wrong-origin attempts/sessions cannot cross deployment identities', async () => {
  const db = database(), flow = await start(db), mock = mockLine(flow);
  const wrong = await finish(db, flow, mock, {LINE_LOGIN_CHANNEL_ID: '9876543210'});
  assert.match(wrong.headers.get('location'), /line_state_invalid/);
  const good = await finish(db, flow, mock);
  const session = cookies(good).join('; ');
  assert.equal((await authenticateLineRequest(request('/api/workspace', session), env(db, {LINE_LOGIN_CHANNEL_ID: '9876543210'}), NOW)).headers.get('oai-authenticated-user-id'), null);
  assert.equal((await authenticateLineRequest(new Request('https://other.example/api/workspace', {headers: {Cookie: session}}), env(db), NOW)).headers.get('oai-authenticated-user-id'), null);
});

test('expired, forged, duplicate cookies and identity headers are rejected', async () => {
  const db = database(), flow = await start(db), good = await finish(db, flow, mockLine(flow));
  const session = cookies(good).find(c => c.startsWith(`${SESSION_COOKIE}=`));
  for (const [header, now] of [[`${SESSION_COOKIE}=${'Z'.repeat(43)}`, NOW], [`${session}; ${session}`, NOW], [session, NOW + 31 * 86400000], ['', NOW]]) {
    const result = await authenticateLineRequest(request('/api/workspace', header, {headers: {'oai-authenticated-user-id': 'admin', 'oai-authenticated-user-email': 'owner@example.com', 'oai-authenticated-auth-provider': 'line'}}), env(db), now);
    assert.equal(result.headers.get('oai-authenticated-user-id'), null);
    assert.equal(result.headers.get('oai-authenticated-user-email'), null);
    assert.equal(result.headers.get('oai-authenticated-auth-provider'), null);
  }
});

test('logout requires same-origin POST, revokes the session and clears both cookies', async () => {
  const db = database(), flow = await start(db), good = await finish(db, flow, mockLine(flow));
  const session = cookies(good).find(c => c.startsWith(`${SESSION_COOKIE}=`));
  assert.equal((await handleLineAuthRequest(request('/auth/logout', session), env(db))).status, 405);
  assert.equal((await handleLineAuthRequest(request('/auth/logout', session, {method: 'POST', headers: {Origin: 'https://evil.example'}}), env(db))).status, 403);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_sessions').get().n, 1);
  const logout = await handleLineAuthRequest(request('/auth/logout', session, {method: 'POST', headers: {Origin: ORIGIN}}), env(db));
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get('location'), '/');
  assert.equal(logout.headers.getSetCookie().length, 2);
  assert.ok(logout.headers.getSetCookie().every(c => c.includes('Max-Age=0')));
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_sessions').get().n, 0);
  assert.equal((await authenticateLineRequest(request('/api/workspace', session), env(db), NOW)).headers.get('oai-authenticated-user-id'), null);
});

test('identity sanitization preserves POST body and unrelated headers', async () => {
  const original = request('/api/pages', '', {method: 'POST', body: '{"name":"test"}', headers: {'Content-Type': 'application/json', 'oai-authenticated-user-id': 'forged'}});
  const result = await authenticateLineRequest(original, {});
  assert.equal(result.method, 'POST');
  assert.equal(result.headers.get('content-type'), 'application/json');
  assert.equal(await result.text(), '{"name":"test"}');
  assert.equal(result.headers.get('oai-authenticated-user-id'), null);
});

