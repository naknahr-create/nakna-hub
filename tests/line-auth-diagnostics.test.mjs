import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleLineAuthRequest} from '../lib/line-auth.ts';

// Exercise real auth code and SQLite. Provider responses are mocked, and all
// sensitive-looking values below are fixtures, never live credentials.
const ORIGIN = 'https://diagnostics.example.com';
const CHANNEL = '1234567890';
const NOW = Date.parse('2026-11-13T02:00:00Z');
const PRIVATE = 'DO_NOT_LOG_DIAGNOSTIC_FIXTURE';

function database() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  }
  const failures = {claim: false, begin: false, persist: false};
  const prepare = query => ({
    query, values: [],
    bind(...values) {return {...this, values};},
    async first() {
      if (failures.claim && this.query.includes('DELETE FROM hub_line_auth_attempts')) throw new Error(PRIVATE + ' D1 claim details');
      return sql.prepare(this.query).get(...this.values) ?? null;
    },
    async run() {
      const result = sql.prepare(this.query).run(...this.values);
      return {success: true, meta: {changes: Number(result.changes)}};
    },
  });
  return {sql, failures, prepare, async batch(statements) {
    if (failures.begin && statements.some(statement => statement.query.includes('INSERT INTO hub_line_auth_attempts')))
      throw new Error(PRIVATE + ' D1 begin details');
    if (failures.persist && statements.some(statement => statement.query.includes('INSERT INTO hub_line_sessions')))
      throw new Error(PRIVATE + ' D1 persistence details');
    sql.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sql.exec('COMMIT'); return results;
    } catch (error) {sql.exec('ROLLBACK'); throw error;}
  }};
}
function env(db) {
  return {DB: db, APP_ORIGIN: ORIGIN, LINE_LOGIN_CHANNEL_ID: CHANNEL, LINE_LOGIN_CHANNEL_SECRET: PRIVATE + '_channel_secret'};
}
async function begin(db) {
  const response = await handleLineAuthRequest(new Request(ORIGIN + '/auth/line/start'), env(db), {now: () => NOW});
  assert.equal(response.status, 303);
  const url = new URL(response.headers.get('location'));
  return {url, state: url.searchParams.get('state'), cookie: response.headers.getSetCookie()[0].split(';')[0]};
}
function callback(flow, error) {
  const url = new URL('/auth/line/callback', ORIGIN);
  url.searchParams.set('state', flow.state);
  url.searchParams.set(error === undefined ? 'code' : 'error', error ?? PRIVATE + '_authorization_code');
  return new Request(url, {headers: {Cookie: flow.cookie}});
}
function provider(flow, {token, verify, friendship} = {}) {
  return async url => {
    if (url.endsWith('/token')) return token ? token() : Response.json({id_token: PRIVATE + '_id_token', access_token: PRIVATE + '_access_token'});
    if (url.endsWith('/verify')) return verify ? verify() : Response.json({
      iss: 'https://access.line.me', aud: CHANNEL, sub: 'U' + 'a'.repeat(32),
      nonce: flow.url.searchParams.get('nonce'), iat: NOW / 1000, exp: NOW / 1000 + 3600, name: PRIVATE + '_display_name',
    });
    if (url.endsWith('/friendship/v1/status')) return friendship ? friendship() : Response.json({friendFlag: true});
    throw new Error('Unexpected mock endpoint');
  };
}
async function capture(run) {
  const previous = console.warn, logs = [];
  console.warn = (...args) => logs.push(args);
  try {return {response: await run(), logs};} finally {console.warn = previous;}
}
function assertUnavailable(result, diagnostic) {
  assert.equal(result.response.status, 303);
  assert.equal(result.response.headers.get('location'), '/studio?auth_error=line_unavailable');
  assert.deepEqual(result.logs, [['LINE authentication failed', diagnostic]]);
  const encoded = JSON.stringify(result.logs);
  assert.ok(!encoded.includes(PRIVATE));
  assert.ok(!encoded.includes(ORIGIN));
  assert.ok(!encoded.includes('state='));
  assert.ok(!encoded.includes('Cookie'));
}

for (const [name, overrides, expected] of [
  ['token HTTP refusal', {token: () => Response.json({error: PRIVATE, error_description: PRIVATE}, {status: 401})}, {stage: 'token', category: 'upstream_http', status: 401}],
  ['verification HTTP refusal', {verify: () => Response.json({error: PRIVATE}, {status: 400})}, {stage: 'verify', category: 'upstream_http', status: 400}],
  ['recognized invalid client', {token: () => Response.json({error: 'invalid_client', error_description: PRIVATE}, {status: 400})}, {stage: 'token', category: 'upstream_invalid_client', status: 400}],
  ['recognized invalid grant', {token: () => Response.json({error: 'invalid_grant', error_description: PRIVATE}, {status: 400})}, {stage: 'token', category: 'upstream_invalid_grant', status: 400}],
  ['non-JSON HTTP error body', {token: () => new Response(PRIVATE, {status: 502})}, {stage: 'token', category: 'upstream_http', status: 502}],
  ['token timeout', {token: () => {throw new DOMException(PRIVATE, 'TimeoutError');}}, {stage: 'token', category: 'timeout'}],
  ['token network failure', {token: () => {throw new TypeError(PRIVATE + ' private upstream URL');}}, {stage: 'token', category: 'network_error'}],
  ['malformed JSON', {token: () => new Response('{"private":"' + PRIVATE)}, {stage: 'token', category: 'invalid_json', status: 200}],
  ['invalid JSON shape', {token: () => Response.json([PRIVATE])}, {stage: 'token', category: 'invalid_response', status: 200}],
  ['oversized response', {token: () => new Response(PRIVATE, {headers: {'content-length': '65537'}})}, {stage: 'token', category: 'response_too_large', status: 200}],
  ['empty response', {token: () => new Response(null, {status: 200})}, {stage: 'token', category: 'empty_response', status: 200}],
]) {
  test(`diagnostic identifies ${name} without leaking upstream or OAuth data`, async () => {
    const db = database();
    try {
      const flow = await begin(db);
      const result = await capture(() => handleLineAuthRequest(callback(flow), env(db), {now: () => NOW, fetcher: provider(flow, overrides)}));
      assertUnavailable(result, expected);
      assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_sessions').get().n, 0);
    } finally {db.sql.close();}
  });
}

for (const [failure, stage] of [['claim', 'claim_attempt'], ['persist', 'persist_session']]) {
  test(`diagnostic identifies ${stage} database failure without raw D1 error`, async () => {
    const db = database();
    try {
      const flow = await begin(db); db.failures[failure] = true;
      const result = await capture(() => handleLineAuthRequest(callback(flow), env(db), {now: () => NOW, fetcher: provider(flow)}));
      assertUnavailable(result, {stage, category: 'database_error'});
      assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_sessions').get().n, 0);
    } finally {db.sql.close();}
  });
}
test('diagnostic identifies begin-login database failure without raw D1 error', async () => {
  const db = database(); db.failures.begin = true;
  try {
    const result = await capture(() => handleLineAuthRequest(new Request(ORIGIN + '/auth/line/start'), env(db), {now: () => NOW}));
    assertUnavailable(result, {stage: 'begin_login', category: 'database_error'});
  } finally {db.sql.close();}
});
test('unknown provider callback errors are reduced to an allowlisted category', async () => {
  const db = database();
  try {
    const flow = await begin(db);
    const result = await capture(() => handleLineAuthRequest(callback(flow, PRIVATE + '_provider_error'), env(db), {now: () => NOW}));
    assertUnavailable(result, {stage: 'provider_callback', category: 'provider_error'});
  } finally {db.sql.close();}
});
test('unexpected exceptions are logged with a fixed fallback category only', async () => {
  const db = database();
  try {
    const result = await capture(() => handleLineAuthRequest(new Request(ORIGIN + '/auth/line/start'), env(db), {now: () => {throw new Error(PRIVATE);}}));
    assertUnavailable(result, {stage: 'begin_login', category: 'unexpected_error'});
  } finally {db.sql.close();}
});
test('successful login remains successful and silent when optional friendship lookup fails', async () => {
  const db = database();
  try {
    const flow = await begin(db);
    const result = await capture(() => handleLineAuthRequest(callback(flow), env(db), {
      now: () => NOW, fetcher: provider(flow, {friendship: () => {throw new Error(PRIVATE);}}),
    }));
    assert.equal(result.response.status, 303);
    assert.equal(result.response.headers.get('location'), '/studio');
    assert.deepEqual(result.logs, []);
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_sessions').get().n, 1);
  } finally {db.sql.close();}
});
test('intentional user denial keeps the existing result and is not logged as a failure', async () => {
  const db = database();
  try {
    const flow = await begin(db);
    const result = await capture(() => handleLineAuthRequest(callback(flow, 'access_denied'), env(db), {now: () => NOW}));
    assert.equal(result.response.headers.get('location'), '/studio?auth_error=line_denied');
    assert.deepEqual(result.logs, []);
  } finally {db.sql.close();}
});
