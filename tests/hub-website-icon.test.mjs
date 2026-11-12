import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {imageAssetId, iconDomain, websiteIconUrl} from '../lib/hub-link-media.ts';

const bundle = buildSync({entryPoints: [fileURLToPath(new URL('../lib/hub-website-icon.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node'});
const {websiteIcon} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const PNG = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const request = (query = 'domain=naknahr.com', init) => new Request('https://hub.example.com/api/link-icon?' + query, init);

test('website icon helper sends only the public hostname and image ids remain canonical', () => {
  assert.equal(websiteIconUrl('https://naknahr.com/private/path?token=SECRET#fragment'), '/api/link-icon?domain=naknahr.com');
  assert.equal(imageAssetId('image:12345678-1234-4234-9234-123456789ABC'), '12345678-1234-4234-9234-123456789abc');
  assert.equal(imageAssetId('image:https://other.example/x.png'), null);
  for (const url of ['mailto:a@example.com','javascript:alert(1)','https://u:p@naknahr.com','http://127.0.0.1','http://2130706433','http://[::1]','http://localhost','https://printer.local']) {
    assert.equal(websiteIconUrl(url), null);
  }
  for (const domain of ['../example.com','example.com/path','example.com?secret=1','localhost','169.254.169.254','host.internal','a..com','a.com:443']) assert.equal(iconDomain(domain), null);
});

test('icon proxy uses a fixed provider, strips incoming credentials, and caches a raster response', async () => {
  let calls = 0;
  const entries = new Map();
  const cache = {async match(key) {return entries.get(key.url)?.clone();}, async put(key, response) {entries.set(key.url, response);}};
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(url, 'https://icons.duckduckgo.com/ip3/naknahr.com.ico');
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
});

test('invalid or repeated domain parameters cannot trigger an outbound request', async () => {
  let calls = 0;
  for (const query of ['domain=localhost','domain=169.254.169.254','domain=a.com&domain=b.com','domain=a.com&url=https://private','domain=https://a.com']) {
    assert.equal((await websiteIcon(request(query), {fetcher: async () => {calls++; throw Error('must not fetch');}})).status, 400);
  }
  assert.equal(calls, 0);
});

test('redirects, active image formats, oversized payloads and outages fall back without following', async () => {
  for (const create of [
    () => new Response(null, {status: 302, headers: {Location: 'http://169.254.169.254/'}}),
    () => new Response('<svg onload="alert(1)"></svg>', {headers: {'Content-Type': 'image/svg+xml'}}),
    () => new Response(PNG, {headers: {'Content-Length': '262145'}}),
    () => new Response(new Uint8Array(262145)),
    () => {throw new TypeError('network unavailable');},
  ]) {
    let calls = 0;
    const result = await websiteIcon(request(), {fetcher: async () => {calls++; return create();}});
    assert.equal(result.status, 404);
    assert.equal(calls, 1);
    assert.equal(result.headers.get('location'), null);
  }
});
