import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import ts from 'typescript';
import {generateKeyPair, exportJWK, SignJWT} from 'jose';

// Execute the real application modules. Only the Workers environment import is
// substituted; TypeScript and extensionless imports use the same project source.
const root = new URL('../', import.meta.url);
const testEnv = {};
const environmentKey = Symbol.for('nakna-hub.integration.environment');
globalThis[environmentKey] = testEnv;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {
      url: 'data:text/javascript,export const env = globalThis[Symbol.for("nakna-hub.integration.environment")];',
      shortCircuit: true,
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

const {getAuthConfiguration, authenticateHubRequest} = await import('../lib/hub-auth.ts');
const {requireAccount, getWorkspace, createPage, getPage, getOperator} = await import('../lib/hub-data.ts');
const {GET: configGET} = await import('../app/api/auth/config/route.ts');
const {GET: workspaceGET} = await import('../app/api/workspace/route.ts');
const ORIGIN = 'https://hub.example.com';
const CHANNEL = '1234567890';
const SUBJECT_A = 'U' + 'a'.repeat(32), SUBJECT_B = 'U' + 'b'.repeat(32);
const ACCESS_ISSUER = 'https://nakna-integration.cloudflareaccess.com';
const ACCESS_AUDIENCE = 'd'.repeat(64);
const {publicKey, privateKey} = await generateKeyPair('RS256');
const jwk = {...await exportJWK(publicKey), kid: 'integration-key', alg: 'RS256', use: 'sig'};
const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async (url) => {
  fetchCalls++;
  assert.equal(String(url), `${ACCESS_ISSUER}/cdn-cgi/access/certs`, 'no live provider calls are allowed');
  return Response.json({keys: [jwk]});
};
const databases = [];
after(() => {
  globalThis.fetch = originalFetch;
  hooks.deregister();
  delete globalThis[environmentKey];
  for (const database of databases) database.close();
});

function sqlite() {
  const sql = new DatabaseSync(':memory:');
  databases.push(sql);
  sql.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync(new URL('drizzle/', root)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sql.exec(readFileSync(new URL('drizzle/' + name, root), 'utf8'));
  }
  const statement = (query, values = []) => ({
    query, values,
    bind(...args) {return statement(query, args);},
    async first(column) {const row = sql.prepare(query).get(...values); return row ? column ? row[column] : {...row} : null;},
    async all() {return {results: sql.prepare(query).all(...values).map(row => ({...row})), success: true};},
    async run() {return this.execute();},
    execute() {const result = sql.prepare(query).run(...values); return {success: true, meta: {changes: Number(result.changes)}};},
  });
  return {sql, prepare: statement, async batch(statements) {
    sql.exec('BEGIN');
    try {const results = statements.map(s => s.execute()); sql.exec('COMMIT'); return results;}
    catch (error) {sql.exec('ROLLBACK'); throw error;}
  }};
}
function setup(provider = 'line', extra = {}) {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  Object.assign(testEnv, {DB: sqlite(), APP_ORIGIN: ORIGIN}, provider === 'line' ? {
    LINE_LOGIN_CHANNEL_ID: CHANNEL, LINE_LOGIN_CHANNEL_SECRET: 'TEST_LINE_SECRET_NOT_A_REAL_SECRET',
  } : provider === 'access' ? {
    CF_ACCESS_TEAM_DOMAIN: ACCESS_ISSUER, CF_ACCESS_AUD: ACCESS_AUDIENCE,
  } : {}, extra);
  fetchCalls = 0;
  return testEnv.DB;
}
function request(path = '/api/workspace', cookie = '', init = {}) {
  return new Request(ORIGIN + path, {...init, headers: {...init.headers, ...(cookie ? {Cookie: cookie} : {})}});
}
async function session(subject = SUBJECT_A, {email = '', name = 'นอต', channel = CHANNEL, origin = ORIGIN} = {}) {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');
  const now = Date.now();
  testEnv.DB.sql.prepare(`INSERT INTO hub_line_sessions
    (token_hash,user_id,line_user_id,login_channel_id,origin,display_name,email,created_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(hash, `line:${channel}:${subject}`, subject, channel, origin, name, email, now, now + 600_000);
  return '__Host-nakna_session=' + token;
}
async function accessToken({subject = 'access-owner', email = 'same@example.com'} = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({iss: ACCESS_ISSUER, aud: [ACCESS_AUDIENCE], sub: subject, email, name: 'Access owner', type: 'app', iat: now - 1, nbf: now - 1, exp: now + 600})
    .setProtectedHeader({alg: 'RS256', kid: 'integration-key'}).sign(privateKey);
}
const authenticated = (incoming) => authenticateHubRequest(incoming, testEnv);
const totalAccounts = () => testEnv.DB.sql.prepare('SELECT COUNT(*) AS n FROM hub_accounts').get().n;

test('public auth config exposes only login UI metadata with LINE primary and explicit Access fallback', async () => {
  setup('line', {
    CF_ACCESS_TEAM_DOMAIN: ACCESS_ISSUER, CF_ACCESS_AUD: ACCESS_AUDIENCE,
    LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: 'PRIVATE_MESSAGE_TOKEN', ADMIN_LINE_USER_ID: SUBJECT_B,
  });
  const response = configGET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const publicConfig = await response.json();
  assert.deepEqual(publicConfig, {
    provider: 'line', configured: true, signInUrl: '/auth/line/start?returnTo=%2Fstudio',
    signOutUrl: '/auth/logout', signOutMethod: 'POST',
  });
  assert.doesNotMatch(JSON.stringify(publicConfig), /TEST_LINE_SECRET|PRIVATE_MESSAGE_TOKEN|1234567890|cloudflareaccess|Ubbbb/);
  delete testEnv.LINE_LOGIN_CHANNEL_SECRET;
  assert.equal(getAuthConfiguration(testEnv).provider, 'access');
  delete testEnv.CF_ACCESS_AUD;
  assert.equal(getAuthConfiguration(testEnv).provider, 'none');
  assert.equal(getAuthConfiguration(testEnv).configured, false);
});

test('unconfigured installation strips forged headers and returns controlled readiness metadata without creating an account', async () => {
  setup('none');
  const incoming = request('/api/workspace', '', {headers: {
    'oai-authenticated-user-id': `line:${CHANNEL}:${SUBJECT_A}`,
    'oai-authenticated-user-email': 'admin@example.com',
    'oai-authenticated-auth-provider': 'line',
  }});
  const trusted = await authenticated(incoming);
  assert.equal([...trusted.headers.keys()].some(key => key.startsWith('oai-authenticated-')), false);
  const response = await workspaceGET(trusted);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'auth_not_configured');
  assert.equal(totalAccounts(), 0);
  assert.equal(fetchCalls, 0);
});

test('LINE primary rejects forged identity and valid Access JWT without a LINE session', async () => {
  setup('line', {CF_ACCESS_TEAM_DOMAIN: ACCESS_ISSUER, CF_ACCESS_AUD: ACCESS_AUDIENCE});
  const jwt = await accessToken();
  const incoming = request('/api/workspace', '', {headers: {
    'cf-access-jwt-assertion': jwt,
    'oai-authenticated-user-id': `line:${CHANNEL}:${SUBJECT_A}`,
    'oai-authenticated-user-email': 'admin@example.com',
  }});
  const trusted = await authenticated(incoming);
  assert.equal(trusted.headers.get('oai-authenticated-user-id'), null);
  const response = await workspaceGET(trusted);
  assert.equal(response.status, 401);
  const result = await response.json();
  assert.equal(result.provider, 'line');
  assert.equal(result.signInUrl, '/auth/line/start?returnTo=%2Fstudio');
  assert.equal(totalAccounts(), 0);
  assert.equal(fetchCalls, 0, 'Access key fetching must not occur when LINE is primary');
});

test('verified LINE session creates a starter account with blank email and never adopts spoofed identity', async () => {
  setup('line', {CF_ACCESS_TEAM_DOMAIN: ACCESS_ISSUER, CF_ACCESS_AUD: ACCESS_AUDIENCE});
  const cookie = await session();
  const trusted = await authenticated(request('/api/workspace', cookie, {headers: {
    'oai-authenticated-user-id': 'victim', 'oai-authenticated-user-email': 'forged@example.com',
    'oai-authenticated-user-full-name': 'Forged name', 'cf-access-jwt-assertion': await accessToken(),
  }}));
  const account = await requireAccount(trusted);
  assert.equal(account.user_id, `line:${CHANNEL}:${SUBJECT_A}`);
  assert.equal(account.email, '');
  assert.equal(account.display_name, 'นอต');
  assert.equal(account.plan, 'starter');
  const workspace = await getWorkspace(trusted);
  assert.equal(workspace.account.email, '');
  assert.equal(workspace.account.isOperator, false);
  assert.equal(totalAccounts(), 1);
  assert.equal(fetchCalls, 0);
});

test('same email never joins LINE tenants or an existing Access account; page ownership remains isolated', async () => {
  const db = setup();
  const sharedEmail = 'same@example.com', previousId = crypto.randomUUID(), now = Date.now();
  db.sql.prepare('INSERT INTO hub_accounts(id,user_id,display_name,email,plan,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(previousId, `cf-access:${ACCESS_ISSUER}:previous-user`, 'Existing account', sharedEmail, 'pro', now, now);
  const cookieA = await session(SUBJECT_A, {email: sharedEmail, name: 'Owner A'});
  const cookieB = await session(SUBJECT_B, {email: sharedEmail, name: 'Owner B'});
  const ownerA = await authenticated(request('/api/workspace', cookieA));
  const ownerB = await authenticated(request('/api/workspace', cookieB));
  const accountA = await requireAccount(ownerA), accountB = await requireAccount(ownerB);
  assert.notEqual(accountA.id, accountB.id);
  assert.notEqual(accountA.id, previousId);
  assert.equal(accountA.plan, 'starter');
  assert.equal(totalAccounts(), 3);
  const createRequest = await authenticated(request('/api/pages', cookieA, {
    method: 'POST', headers: {Origin: ORIGIN, 'Content-Type': 'application/json'},
    body: JSON.stringify({name: 'Private A page', slug: 'owner-a-page', template: 'creator'}),
  }));
  const created = await createPage(createRequest);
  assert.equal(created.page.title, 'Private A page');
  assert.equal((await getWorkspace(ownerA)).pages.length, 1);
  assert.equal((await getWorkspace(ownerB)).pages.length, 0);
  await assert.rejects(getPage(ownerB, created.page.id), error => error.status === 404);
  assert.equal(db.sql.prepare('SELECT account_id FROM hub_pages WHERE id=?').get(created.page.id).account_id, accountA.id);
});

test('customer sign-up cannot bootstrap operator access; an explicitly configured LINE subject binds the single operator', async () => {
  const db = setup('line', {ADMIN_EMAIL: 'same@example.com', ADMIN_LINE_USER_ID: SUBJECT_B});
  const ordinary = await authenticated(request('/api/workspace', await session(SUBJECT_A, {email: 'same@example.com'})));
  assert.equal((await getWorkspace(ordinary)).account.isOperator, false);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM hub_operators').get().n, 0);
  await assert.rejects(getOperator(ordinary), error => error.status === 403);
  const designated = await authenticated(request('/api/workspace', await session(SUBJECT_B)));
  assert.equal((await getWorkspace(designated)).account.isOperator, true);
  assert.equal(db.sql.prepare('SELECT user_id FROM hub_operators').get().user_id, `line:${CHANNEL}:${SUBJECT_B}`);
  testEnv.ADMIN_LINE_USER_ID = SUBJECT_A;
  assert.equal((await getWorkspace(ordinary)).account.isOperator, false, 'changing environment cannot seize an already-bound operator');
});

test('explicit Access fallback verifies the signed identity and remains separate from matching LINE email', async () => {
  const db = setup('access');
  const existingId = crypto.randomUUID(), now = Date.now();
  db.sql.prepare('INSERT INTO hub_accounts(id,user_id,display_name,email,plan,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(existingId, `line:${CHANNEL}:${SUBJECT_A}`, 'LINE owner', 'same@example.com', 'starter', now, now);
  const trusted = await authenticated(request('/api/workspace', '', {headers: {
    'cf-access-jwt-assertion': await accessToken(),
    'oai-authenticated-user-id': `line:${CHANNEL}:${SUBJECT_A}`,
    'oai-authenticated-user-email': 'forged@example.com',
  }}));
  const account = await requireAccount(trusted);
  assert.equal(account.user_id, `cf-access:${ACCESS_ISSUER}:access-owner`);
  assert.equal(account.email, 'same@example.com');
  assert.notEqual(account.id, existingId);
  assert.equal(totalAccounts(), 2);
  assert.equal(fetchCalls, 1, 'only the mocked Access JWKS endpoint was requested');
  assert.equal(getAuthConfiguration(testEnv).signOutUrl, '/cdn-cgi/access/logout');
});
