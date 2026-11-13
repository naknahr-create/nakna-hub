import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHubRedirect } from '../lib/hub-canonical.ts';

const OLD = 'https://nakna-hub.nakna.workers.dev';
const HUB = 'https://hub.naknahr.com';
const redirect = (path, method = 'GET', origin = HUB) => canonicalHubRedirect(new Request(`${OLD}${path}`, {method}), origin);

test('existing shared and studio links move to the canonical host with their path and query', () => {
  for (const path of ['/', '/studio?page=page-id', '/admin?tab=accounts', '/h/naknahr?utm_source=line', '/go/link-id', '/privacy', '/terms', '/billing/terms']) {
    const response = redirect(path);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `${HUB}${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(redirect('/h/naknahr', 'HEAD').headers.get('location'), `${HUB}/h/naknahr`);
});

test('login begins on the new host before a host-bound OAuth attempt is created', () => {
  assert.equal(redirect('/auth/line/start?returnTo=%2Fstudio%3Fpage%3Dabc').headers.get('location'), `${HUB}/auth/line/start?returnTo=%2Fstudio%3Fpage%3Dabc`);
});

test('an old OAuth callback restarts login without forwarding its code or state', () => {
  const response = redirect('/auth/line/callback?code=old-code&state=old-state&error=denied');
  assert.equal(response.headers.get('location'), `${HUB}/studio?auth_error=line_state_invalid`);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.has('set-cookie'), false);
});

test('Stripe and LINE webhook bodies, event ingestion and all mutations are never redirected', () => {
  for (const path of ['/api/billing/webhook', '/api/line/webhook', '/api/events', '/api/workspace', '/api/pages/abc', '/studio', '/auth/logout']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(redirect(path, method), null);
  }
  for (const path of ['/api/billing/webhook', '/api/line/webhook', '/api/workspace', '/api/link-icon?url=example.com', '/media/avatar', '/assets/app.js', '/favicon.svg']) assert.equal(redirect(path), null);
});

test('canonical, preview, local and unrelated hosts never redirect or loop', () => {
  for (const origin of [HUB, 'https://preview-nakna-hub.nakna.workers.dev', 'https://example.com', 'http://localhost:5173']) {
    assert.equal(canonicalHubRedirect(new Request(`${origin}/studio`), HUB), null);
  }
});

test('migration is inactive with old, absent or invalid configuration', () => {
  for (const origin of [undefined, '', OLD, 'http://hub.naknahr.com', 'https://example.com', `${HUB}/subpath`, `${HUB}?x=1`, `${HUB}#x`, 'https://user:pass@hub.naknahr.com']) {
    assert.equal(canonicalHubRedirect(new Request(`${OLD}/studio`), origin), null);
  }
  assert.equal(redirect('/studio', 'GET', `${HUB}/`).headers.get('location'), `${HUB}/studio`);
});

test('crafted paths and return targets cannot change the destination host', () => {
  assert.equal(redirect('//example.com/studio'), null);
  const response = redirect('/h//example.com?return_to=https://example.com');
  assert.equal(new URL(response.headers.get('location')).origin, HUB);
});
