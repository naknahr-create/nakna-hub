import test from 'node:test';
import assert from 'node:assert/strict';
import {HUB_THEMES, HUB_THEME_CATEGORIES, applyHubTheme, getHubTheme, getHubThemeCssVars} from '../lib/hub-themes.ts';

const profile = {
  name: 'ชื่อของฉัน', handle: '@my-hub', tagline: 'My work', bio: 'ข้อมูลที่เจ้าของเขียนไว้',
  avatarUrl: '/media/owned-avatar', accent: '#04878A', theme: 'light', layout: 'stack', background: 'mint', showBranding: false,
};
const rgb = value => value.match(/^#([a-f\d]{6})$/i)?.[1].match(/../g).map(part => parseInt(part, 16));
const luminance = values => values.map(value => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('every ready-made design has legible body, secondary and accent text on its authored surfaces', () => {
  assert.equal(HUB_THEMES.length, 24);
  assert.equal(new Set(HUB_THEMES.map(theme => theme.id)).size, HUB_THEMES.length);
  for (const category of HUB_THEME_CATEGORIES) assert.equal(HUB_THEMES.filter(theme => theme.category === category.id).length, 4);
  for (const theme of HUB_THEMES) {
    const paper = rgb(theme.tokens.paper), card = rgb(theme.tokens.card);
    assert.ok(paper && card, `${theme.id}: opaque fallback surfaces`);
    const backgrounds = [paper, card];
    for (const value of theme.tokens.backgroundImage.match(/#[a-f\d]{6}/ig) ?? []) backgrounds.push(rgb(value));
    const layers = [...theme.tokens.backgroundImage.matchAll(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g)].map(match => match.slice(1).map(Number));
    let composite = paper;
    for (const [r, g, b, alpha] of layers) {
      composite = [r, g, b].map((value, i) => value * alpha + composite[i] * (1 - alpha));
      backgrounds.push(composite);
    }
    for (const [role, value] of [['body', theme.tokens.ink], ['secondary', theme.tokens.muted], ['accent', theme.profile.accent]]) {
      assert.ok(rgb(value), `${theme.id}: ${role} is an opaque text color`);
      for (const background of backgrounds) assert.ok(contrast(rgb(value), background) >= 4.5,
        `${theme.id}: ${role} contrast ${contrast(rgb(value), background).toFixed(2)} against ${background}`);
    }
    assert.ok(Math.max(contrast(rgb(theme.profile.accent), rgb('#173536')), contrast(rgb(theme.profile.accent), rgb('#FFFFFF'))) >= 4.5,
      `${theme.id}: a legible foreground is available for the featured link`);
    assert.doesNotMatch(Object.values(theme.tokens).join(' '), /url\(|@import|javascript:|<|>/i);
  }
});

test('applying any design preserves customer content, media and branding choice without mutating the input', () => {
  const original = {...profile};
  for (const theme of HUB_THEMES) {
    const selected = applyHubTheme(profile, theme.id);
    assert.equal(selected.themeId, theme.id);
    for (const field of ['name', 'handle', 'tagline', 'bio', 'avatarUrl', 'showBranding']) assert.equal(selected[field], profile[field]);
    assert.deepEqual(getHubThemeCssVars(selected)['--hc-paper'], theme.tokens.paper);
  }
  assert.deepEqual(profile, original);
  assert.throws(() => applyHubTheme(profile, 'not-a-theme'), RangeError);
});

test('legacy, custom and unknown themes keep the previous rendering without injecting arbitrary styles', () => {
  for (const themeId of [undefined, '', 'custom', 'unknown', '__proto__', 'url(https://example.com)']) {
    assert.equal(getHubTheme(themeId), undefined);
    assert.deepEqual(getHubThemeCssVars({...profile, themeId}), {});
  }
});
