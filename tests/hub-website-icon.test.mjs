import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {imageAssetId, iconDomain, websiteIconFallback, websiteIconUrl} from '../lib/hub-link-media.ts';

const bundle = buildSync({entryPoints: [fileURLToPath(new URL('../lib/hub-website-icon.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node'});
const {websiteIcon} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const PNG = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const request = (query = 'domain=naknahr.com&v=2', init) => new Request('https://hub.example.com/api/link-icon?' + query, init);
const google = 'https://www.google.com/s2/favicons?domain=naknahr.com&sz=64';
const duck = 'https://icons.duckduckgo.com/ip3/naknahr.com.ico';
const googleImage = 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://naknahr.com&size=64';

test('website icon helper sends only the public hostname and image ids remain canonical', () => {
  assert.equal(websiteIconUrl('https://naknahr.com/private/path?token=SECRET#fragment'), '/api/link-icon?domain=naknahr.com&v=2');
  assert.equal(websiteIconUrl('https://naknahr.com/private/path?token=SECRET#fragment', true), '/api/link-icon?domain=naknahr.com&v=2&retry=1');
  assert.equal(imageAssetId('image:12345678-1234-4234-9234-123456789ABC'), '12345678-1234-4234-9234-123456789abc');
  assert.equal(imageAssetId('image:https://other.example/x.png'), null);
  for (const url of ['mailto:a@example.com','javascript:alert(1)','https://u:p@naknahr.com','http://127.0.0.1','http://2130706433','http://[::1]','http://localhost','https://printer.local']) {
    assert.equal(websiteIconUrl(url), null);
  }
  for (const domain of ['../example.com','example.com/path','example.com?secret=1','localhost','169.254.169.254','host.internal','a..com','a.com:443']) assert.equal(iconDomain(domain), null);
});

test('icon proxy uses fixed providers, strips incoming credentials, and caches only a successful image under the new version', async () => {
  let calls = 0;
  const entries = new Map();
  const cache = {async match(key) {return entries.get(key.url)?.clone();}, async put(key, response) {entries.set(key.url, response);}};
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(url, google);
    assert.equal(init.redirect, 'manual');
    assert.equal(new Headers(init.headers).get('authorization'), null);
    assert.equal(new Headers(init.headers).get('cookie'), null);
    return new Response(PNG, {headers: {'Content-Type': 'text/plain'}});
  };
  const result = await websiteIcon(request(undefined, {headers: {Authorization: 'Bearer PRIVATE', Cookie: 'secret=PRIVATE'}}), {fetcher, cache});
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'image/png');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), PNG);
  const head = await websiteIcon(request(undefined, {method: 'HEAD'}), {fetcher, cache});
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(calls, 1);
  assert.deepEqual([...entries.keys()], ['https://hub.example.com/api/link-icon?domain=naknahr.com&v=2']);
});

test('invalid or repeated domain parameters cannot trigger an outbound request', async () => {
  let calls = 0;
  for (const query of ['domain=localhost','domain=169.254.169.254','domain=a.com&domain=b.com','domain=a.com&url=https://private','domain=https://a.com','domain=a.com&v=1','domain=a.com&v=2&v=2','domain=a.com&retry=2','domain=a.com&retry=1&retry=1','domain=a.com&v=2&retry=1&token=secret']) {
    assert.equal((await websiteIcon(request(query), {fetcher: async () => {calls++; throw Error('must not fetch');}})).status, 400);
  }
  assert.equal(calls, 0);
});

test('active image formats, oversized payloads and outages try the independent provider and never cache failures', async () => {
  for (const create of [
    () => new Response(null, {status: 302, headers: {Location: 'http://169.254.169.254/'}}),
    () => new Response('<svg onload="alert(1)"></svg>', {headers: {'Content-Type': 'image/svg+xml'}}),
    () => new Response(PNG, {headers: {'Content-Length': '262145'}}),
    () => new Response(new Uint8Array(262145)),
    () => {throw new TypeError('network unavailable');},
  ]) {
    let calls = 0;
    let writes = 0;
    const result = await websiteIcon(request(), {fetcher: async () => {calls++; return create();}, cache: {async match() {}, async put() {writes++;}}});
    assert.equal(result.status, 404);
    assert.equal(calls, 2);
    assert.equal(result.headers.get('location'), null);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(writes, 0);
  }
});

test('Google favicon redirect is limited to the observed image endpoint for the same public hostname', async () => {
  const calls = [];
  let firstSignal;
  const fetcher = async (url, init) => {
    calls.push(url);
    assert.equal(init.redirect, 'manual');
    assert.equal(new Headers(init.headers).get('cookie'), null);
    assert.equal(new Headers(init.headers).get('authorization'), null);
    if (url === google) {
      firstSignal = init.signal;
      return new Response(null, {status: 301, headers: {Location: googleImage}});
    }
    assert.equal(url, googleImage);
    assert.equal(init.signal, firstSignal, 'redirect shares the provider deadline');
    return new Response(PNG);
  };
  const result = await websiteIcon(request(undefined, {headers: {Cookie: 'PRIVATE', Authorization: 'Bearer PRIVATE'}}), {fetcher});
  assert.equal(result.status, 200);
  assert.deepEqual(calls, [google, googleImage]);
});

test('redirects cannot escape the exact favicon host/path or carry a different source or credentials', async () => {
  const unsafe = [
    'http://169.254.169.254/',
    googleImage.replace('t0.gstatic.com', 't0.gstatic.com.evil.test'),
    googleImage.replace('t0.gstatic.com', 't1.gstatic.com'),
    googleImage.replace('/faviconV2?', '/other?'),
    googleImage.replace('https://t0.', 'https://user:pass@t0.'),
    googleImage.replace('http://naknahr.com', 'http://localhost'),
    googleImage.replace('http://naknahr.com', 'http://naknahr.com/private'),
    googleImage.replace('http://naknahr.com', 'http://naknahr.com:8080'),
    googleImage + '&url=http://naknahr.com',
    googleImage + '&unexpected=secret',
  ];
  for (const location of unsafe) {
    const calls = [];
    const result = await websiteIcon(request(), {fetcher: async url => {
      calls.push(url);
      return url === google ? new Response(null, {status: 302, headers: {Location: location}}) : new Response(PNG);
    }});
    assert.equal(result.status, 200, 'independent fallback can still serve an image');
    assert.deepEqual(calls, [google, duck]);
  }
});

test('only one Google redirect is allowed and DuckDuckGo redirects are never followed', async () => {
  const calls = [];
  const result = await websiteIcon(request(), {fetcher: async url => {
    calls.push(url);
    return new Response(null, {status: 302, headers: {Location: googleImage}});
  }});
  assert.equal(result.status, 404);
  assert.deepEqual(calls, [google, googleImage, duck]);
});

test('a provider outage does not pin an empty icon and an explicit retry bypasses a previously cached image', async () => {
  const calls = [];
  let cached = new Response(null, {status: 404});
  const cache = {async match() {return cached.clone();}, async put(key, value) {cached = value;} };
  const fetcher = async url => {calls.push(url);return new Response(PNG);};
  assert.equal((await websiteIcon(request(), {fetcher, cache})).status, 200);
  assert.deepEqual(calls, [google], 'stale negative cache is ignored');
  assert.equal((await websiteIcon(request(), {fetcher, cache})).status, 200);
  assert.deepEqual(calls, [google], 'normal image requests use the successful cache');
  assert.equal((await websiteIcon(request('domain=naknahr.com&v=2&retry=1'), {fetcher, cache})).status, 200);
  assert.deepEqual(calls, [google, duck], 'one browser retry bypasses cache and tries the independent image source first');
});

test('website-image fallbacks recognize social links without confusing lookalike hosts', () => {
  assert.equal(websiteIconFallback('https://www.youtube.com/watch?v=public'), 'youtube');
  assert.equal(websiteIconFallback('https://youtu.be/public'), 'youtube');
  assert.equal(websiteIconFallback('https://www.facebook.com/nakna'), 'facebook');
  assert.equal(websiteIconFallback('https://youtube.com.attacker.test'), 'link');
  assert.equal(websiteIconFallback('mailto:hello@naknahr.com'), 'mail');
});
