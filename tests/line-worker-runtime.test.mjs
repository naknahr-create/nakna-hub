import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare, Log, LogLevel} from 'miniflare';

const ORIGIN = 'https://hub.example.com';
const CHANNEL = '1234567890';
const SECRET = 'runtime-test-secret-never-used-outside-this-test';
const LINE_USER = `U${'a'.repeat(32)}`;
const NOW = Date.parse('2026-11-12T12:00:00Z');
const SINK = 'https://credential-sink.example/receive';

function cookieHeader(response) {
  return response.headers.getSetCookie().map(value => value.split(';', 1)[0])
    .filter(value => !value.endsWith('=')).join('; ');
}

// Node's fetch accepts redirect: 'error'; workerd rejects it before networking.
// Run the real auth module through workerd's native fetch and D1 instead of an
// injected JS fetch mock, and intercept every outbound request locally.
test('LINE Login works in the deployed Worker runtime and never follows provider redirects', {timeout: 30_000}, async t => {
  const bundle = await build({
    stdin: {
      contents: `
        import {handleLineAuthRequest, authenticateLineRequest} from './lib/line-auth.ts';
        export default {
          async fetch(request, env) {
            if (new URL(request.url).pathname === '/__test/session') {
              const authenticated = await authenticateLineRequest(request, env, ${NOW});
              return Response.json({
                userId: authenticated.headers.get('oai-authenticated-user-id'),
                provider: authenticated.headers.get('oai-authenticated-auth-provider'),
              });
            }
            return await handleLineAuthRequest(request, env, {now: () => ${NOW}})
              ?? new Response('Not found', {status: 404});
          },
        };
      `,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      sourcefile: 'line-runtime-entry.ts',
      loader: 'ts',
    },
    bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  });
  const state = {mode: 'success', nonce: '', calls: []};
  const runtime = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-05-15',
    compatibilityFlags: ['nodejs_compat'],
    log: new Log(LogLevel.NONE),
    d1Databases: ['DB'],
    bindings: {APP_ORIGIN: ORIGIN, LINE_LOGIN_CHANNEL_ID: CHANNEL, LINE_LOGIN_CHANNEL_SECRET: SECRET},
    outboundService: async request => {
      const url = new URL(request.url);
      const body = await request.text();
      state.calls.push({url: request.url, method: request.method, body,
        contentType: request.headers.get('content-type'), authorization: request.headers.get('authorization')});
      // This is a terminal local interceptor, including for accidental redirects.
      // No request in this test can reach LINE or the redirect destination.
      if (url.origin !== 'https://api.line.me') return new Response('Unexpected destination', {status: 502});
      if (url.pathname === '/oauth2/v2.1/token') {
        if (state.mode === 'token_redirect') return new Response(null, {status: 302, headers: {Location: SINK}});
        return Response.json({id_token: 'runtime-test-id-token', access_token: 'runtime-test-access-token'});
      }
      if (url.pathname === '/oauth2/v2.1/verify') {
        if (state.mode === 'verify_redirect') return new Response(null, {status: 307, headers: {Location: SINK}});
        return Response.json({iss: 'https://access.line.me', aud: CHANNEL, sub: LINE_USER, nonce: state.nonce,
          iat: NOW / 1000, exp: NOW / 1000 + 3600, name: 'Runtime test user'});
      }
      if (url.pathname === '/friendship/v1/status') return Response.json({friendFlag: true});
      return new Response('Unexpected LINE endpoint', {status: 404});
    },
  });
  t.after(() => runtime.dispose());
  const db = await runtime.getD1Database('DB');
  const migrationDirectory = new URL('../drizzle/', import.meta.url);
  for (const name of (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, migrationDirectory), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean);
    await db.batch(statements.map(statement => db.prepare(statement)));
  }

  async function login(mode) {
    state.mode = mode;
    state.calls = [];
    const start = await runtime.dispatchFetch(`${ORIGIN}/auth/line/start`, {redirect: 'manual'});
    assert.equal(start.status, 303);
    const authorization = new URL(start.headers.get('location'));
    assert.equal(authorization.origin, 'https://access.line.me');
    state.nonce = authorization.searchParams.get('nonce');
    const callback = new URL(`${ORIGIN}/auth/line/callback`);
    callback.searchParams.set('code', 'runtime-test-single-use-code');
    callback.searchParams.set('state', authorization.searchParams.get('state'));
    const response = await runtime.dispatchFetch(callback, {redirect: 'manual', headers: {Cookie: cookieHeader(start)}});
    return {response, authorization};
  }

  await t.test('native token and verify requests establish a real D1-backed session', async () => {
    const {response, authorization} = await login('success');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/studio');
    assert.deepEqual(state.calls.map(call => new URL(call.url).pathname), [
      '/oauth2/v2.1/token', '/oauth2/v2.1/verify', '/friendship/v1/status',
    ]);
    const token = state.calls[0];
    assert.equal(token.method, 'POST');
    assert.match(token.contentType, /^application\/x-www-form-urlencoded/);
    const tokenForm = new URLSearchParams(token.body);
    assert.equal(tokenForm.get('client_id'), CHANNEL);
    assert.equal(tokenForm.get('client_secret'), SECRET);
    assert.equal(tokenForm.get('redirect_uri'), `${ORIGIN}/auth/line/callback`);
    const verifier = tokenForm.get('code_verifier');
    assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(createHash('sha256').update(verifier).digest('base64url'), authorization.searchParams.get('code_challenge'));
    const verifyForm = new URLSearchParams(state.calls[1].body);
    assert.equal(verifyForm.get('id_token'), 'runtime-test-id-token');
    assert.equal(verifyForm.get('nonce'), state.nonce);
    const sessionCookie = cookieHeader(response);
    assert.match(sessionCookie, /__Host-nakna_session=/);
    const session = await runtime.dispatchFetch(`${ORIGIN}/__test/session`, {headers: {Cookie: sessionCookie}});
    assert.deepEqual(await session.json(), {userId: `line:${CHANNEL}:${LINE_USER}`, provider: 'line'});
    const count = await db.prepare('SELECT count(*) AS count FROM hub_line_sessions').first();
    assert.equal(count.count, 1);
  });

  for (const [mode, expectedCalls] of [['token_redirect', 1], ['verify_redirect', 2]]) {
    await t.test(`${mode} is rejected without forwarding credentials or creating a session`, async () => {
      const before = await db.prepare('SELECT count(*) AS count FROM hub_line_sessions').first();
      const {response} = await login(mode);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/studio?auth_error=line_unavailable');
      assert.equal(state.calls.length, expectedCalls);
      assert.ok(state.calls.every(call => new URL(call.url).origin === 'https://api.line.me'));
      assert.ok(!response.headers.getSetCookie().some(value => value.startsWith('__Host-nakna_session=')));
      const after = await db.prepare('SELECT count(*) AS count FROM hub_line_sessions').first();
      assert.equal(after.count, before.count);
    });
  }
});
