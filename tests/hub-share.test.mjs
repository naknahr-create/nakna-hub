import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHubShareMetadata, hubShareOrigin, resolveHubShareImage} from '../lib/hub-share.ts';

const avatar = '/media/11111111-1111-4111-8111-111111111111';
const cover = '/media/22222222-2222-4222-8222-222222222222';
const profile = {
  name: 'นากนะ HR', handle: '@naknahr', tagline: 'งาน HR ผ่าน LINE', bio: 'เช็กเวลา\nลา และเอกสาร',
  avatarUrl: avatar, shareImageUrl: cover, accent: '#04878a', theme: 'light', layout: 'stack', background: 'mint', showBranding: true,
};

test('published cover becomes an absolute social image with a canonical URL on the configured origin', () => {
  const data = buildHubShareMetadata(profile, 'naknahr', 'https://hub.example.com/');
  assert.equal(data.metadataBase.href, 'https://hub.example.com/');
  assert.equal(data.alternates.canonical, 'https://hub.example.com/h/naknahr');
  assert.equal(data.openGraph.url, data.alternates.canonical);
  assert.deepEqual(data.openGraph.images, [{url: 'https://hub.example.com' + cover, alt: 'ภาพแนะนำ นากนะ HR'}]);
  assert.equal(data.twitter.card, 'summary_large_image');
  assert.deepEqual(data.twitter.images, ['https://hub.example.com' + cover]);
  assert.equal(data.description, 'เช็กเวลา ลา และเอกสาร');
  assert.deepEqual(data.robots, {index: true, follow: true});
});

test('legacy published profiles share their avatar and profiles without images do not advertise an empty or SVG image', () => {
  const {shareImageUrl, ...legacy} = profile;
  assert.equal(resolveHubShareImage(legacy), 'https://hub.naknahr.com' + avatar);
  assert.equal(resolveHubShareImage({...legacy, avatarUrl: 'https://images.example.com/avatar.jpg'}), 'https://images.example.com/avatar.jpg');
  const empty = buildHubShareMetadata({...legacy, avatarUrl: '', bio: '', tagline: ''}, 'my-hub');
  assert.equal(empty.openGraph.images, undefined);
  assert.equal(empty.twitter.images, undefined);
  assert.equal(empty.twitter.card, 'summary');
  assert.equal(empty.description, 'รวมทุกช่องทางของ นากนะ HR ไว้ในฮับเดียว');
});

test('invalid deployment origins never become canonical URLs', () => {
  for (const value of [undefined, '', 'javascript:alert(1)', 'http://hub.example.com', 'https://user:pass@hub.example.com', 'https://hub.example.com/path', 'https://hub.example.com/?token=secret', 'https://hub.example.com/#draft']) {
    assert.equal(hubShareOrigin(value), 'https://hub.naknahr.com');
    assert.equal(buildHubShareMetadata(profile, 'my-hub', value).openGraph.url, 'https://hub.naknahr.com/h/my-hub');
  }
});

test('malformed covers and unsafe avatar locations do not leak into social metadata', () => {
  for (const shareImageUrl of ['//another.example.com/photo.jpg', '/media/not-an-asset', '/media/../private', cover + '?draft=1', 'https://another.example.com/photo.jpg']) {
    assert.equal(resolveHubShareImage({...profile, shareImageUrl}), 'https://hub.naknahr.com' + avatar);
  }
  for (const avatarUrl of ['data:image/png;base64,foo', 'javascript:alert(1)', 'http://example.com/a.jpg', 'https://user:secret@example.com/a.jpg', 'https://127.0.0.1/a.jpg', 'https://192.168.1.1/a.jpg', 'https://[::1]/a.jpg', 'https://localhost/a.jpg', 'https://office.local/a.jpg']) {
    assert.equal(resolveHubShareImage({...profile, shareImageUrl: '', avatarUrl}), null);
  }
});
