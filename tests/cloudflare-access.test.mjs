import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {accessConfiguration, authenticateAccessRequest} from '../lib/cloudflare-access.ts';

const env = {CF_ACCESS_TEAM_DOMAIN: 'https://nakna-test.cloudflareaccess.com', CF_ACCESS_AUD: 'a'.repeat(64)};
const {publicKey, privateKey} = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const keys = createLocalJWKSet({keys: [{...jwk, kid: 'test-key', use: 'sig', alg: 'RS256'}]});
const now = Math.floor(Date.now() / 1000);
const base = {iss: env.CF_ACCESS_TEAM_DOMAIN, aud: [env.CF_ACCESS_AUD], sub: 'customer-1', email: 'USER@example.com', name: 'นอต', type: 'app', iat: now - 10, nbf: now - 10, exp: now + 600};
const sign = (changes = {}) => new SignJWT({...base, ...changes}).setProtectedHeader({alg: 'RS256', kid: 'test-key'}).sign(privateKey);
const request = (token, headers = {}) => new Request('https://hub.example.com/api/workspace', {headers: {...headers, ...(token ? {'cf-access-jwt-assertion': token} : {})}});
const identity = (r) => r.headers.get('oai-authenticated-user-id');

test('valid configuration normalizes only a trusted HTTPS Access team origin', () => {
  assert.deepEqual(accessConfiguration({...env, CF_ACCESS_TEAM_DOMAIN: env.CF_ACCESS_TEAM_DOMAIN + '/'}), {issuer: env.CF_ACCESS_TEAM_DOMAIN, audience: env.CF_ACCESS_AUD});
  for (const domain of ['http://nakna-test.cloudflareaccess.com', 'https://evil.example.com', 'https://nakna-test.cloudflareaccess.com.evil.example.com', 'https://u:p@nakna-test.cloudflareaccess.com', 'https://nakna-test.cloudflareaccess.com:8443', 'https://nakna-test.cloudflareaccess.com/path', 'https://nakna-test.cloudflareaccess.com/?query=1']) assert.equal(accessConfiguration({...env, CF_ACCESS_TEAM_DOMAIN: domain}), null);
  assert.equal(accessConfiguration({}), null);
  assert.equal(accessConfiguration({...env, CF_ACCESS_AUD: 'not-an-audience'}), null);
});

test('strips spoofed gateway identity even when auth is unconfigured', async () => {
  const r = await authenticateAccessRequest(request(undefined, {'oai-authenticated-user-id': 'victim', 'oai-authenticated-user-email': 'owner@example.com', 'oai-authenticated-extra-role': 'admin'}), {});
  assert.equal(identity(r), null);
  assert.equal([...r.headers.keys()].some(k => k.startsWith('oai-authenticated-')), false);
});

test('headers alone cannot authenticate even with valid configuration', async () => {
  const r = await authenticateAccessRequest(request(undefined, {'oai-authenticated-user-id': 'victim', 'cf-access-authenticated-user-email': 'owner@example.com'}), env, keys);
  assert.equal(identity(r), null);
});

test('a verified app JWT creates only its signed, namespaced identity', async () => {
  const r = await authenticateAccessRequest(request(await sign(), {'oai-authenticated-user-id': 'victim', 'oai-authenticated-user-email': 'owner@example.com'}), env, keys);
  assert.equal(identity(r), `cf-access:${env.CF_ACCESS_TEAM_DOMAIN}:customer-1`);
  assert.equal(r.headers.get('oai-authenticated-user-email'), 'user@example.com');
  assert.equal(decodeURIComponent(r.headers.get('oai-authenticated-user-full-name')), 'นอต');
});

test('verified cookie identity supports public hub and avatar requests', async () => {
  const r = await authenticateAccessRequest(request(undefined, {cookie: `theme=mint; CF_Authorization=${await sign()}; other=1`}), env, keys);
  assert.equal(identity(r), `cf-access:${env.CF_ACCESS_TEAM_DOMAIN}:customer-1`);
});

for (const [label, changes] of [
  ['wrong issuer', {iss: 'https://other.cloudflareaccess.com'}],
  ['wrong audience', {aud: 'b'.repeat(64)}],
  ['expired token', {exp: now - 60}],
  ['not-yet-valid token', {nbf: now + 600}],
  ['future issuance', {iat: now + 600}],
  ['global session token', {type: 'org'}],
  ['service-token identity without email', {email: undefined}],
  ['missing subject', {sub: undefined}],
  ['missing expiration', {exp: undefined}],
]) {
  test(`rejects ${label}`, async () => {
    assert.equal(identity(await authenticateAccessRequest(request(await sign(changes)), env, keys)), null);
  });
}

test('rejects a signature produced by another key', async () => {
  const other = await generateKeyPair('RS256');
  const token = await new SignJWT(base).setProtectedHeader({alg: 'RS256', kid: 'test-key'}).sign(other.privateKey);
  assert.equal(identity(await authenticateAccessRequest(request(token), env, keys)), null);
});

test('rejects unsigned and malformed JWTs and oversized values', async () => {
  for (const token of ['bad-token', `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(base)).toString('base64url')}.`, 'x'.repeat(16_385)]) assert.equal(identity(await authenticateAccessRequest(request(token), env, keys)), null);
});

test('unavailable JWKS fails closed without trusting spoofed headers', async () => {
  const unavailable = async () => {throw new Error('network unavailable');};
  assert.equal(identity(await authenticateAccessRequest(request(await sign(), {'oai-authenticated-user-id': 'victim'}), env, unavailable)), null);
});

test('preserves method, unrelated headers and body through verification', async () => {
  const original = new Request('https://hub.example.com/api/pages', {method: 'POST', headers: {'content-type': 'application/json', origin: 'https://hub.example.com', 'cf-access-jwt-assertion': await sign()}, body: '{"name":"demo"}'});
  const authenticated = await authenticateAccessRequest(original, env, keys);
  assert.equal(authenticated.method, 'POST');
  assert.equal(authenticated.headers.get('origin'), 'https://hub.example.com');
  assert.equal(await authenticated.text(), '{"name":"demo"}');
});
