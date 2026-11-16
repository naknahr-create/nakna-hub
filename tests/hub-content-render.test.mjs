import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith(root.href)) {
      const candidate = new URL(specifier, context.parentURL);
      for (const extension of ['', '.ts', '.tsx']) {
        const file = new URL(candidate.href + extension);
        if (existsSync(file) && /\.(ts|tsx|css)$/.test(file.pathname)) return {url: file.href, shortCircuit: true};
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(root.href) && url.endsWith('.css')) return {format: 'module', shortCircuit: true, source: ''};
    if (url.startsWith(root.href) && /\.tsx?$/.test(url)) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
      }).outputText,
    };
    return nextLoad(url, context);
  },
});
after(() => hooks.deregister());
const {HubCanvas} = await import('../app/components/HubCanvas.tsx');
const {default: HubThemeGallery} = await import('../app/components/HubThemeGallery.tsx');
const {HUB_THEMES, applyHubTheme} = await import('../lib/hub-themes.ts');
const profile = {name: 'ธุรกิจทดสอบ', handle: '@test-hub', tagline: 'ผลงานของเรา', bio: 'ข้อมูลจริงของธุรกิจ', avatarUrl: '', accent: '#04878a', theme: 'light', layout: 'stack', background: 'mint', showBranding: true};
const media = '/media/12000000-0000-4000-8000-000000000001';
const link = (id, type, extra = {}) => ({id, type, title: 'หัวข้อ ' + id, description: '', url: '', icon: 'link', enabled: true, featured: false, sortOrder: 0, archived: false, ...extra});
const blocks = [
  link('old-link', 'link', {url: 'https://example.com/link'}),
  link('heading', 'heading'),
  link('text', 'text', {description: 'ข้อความย่อหน้าแรก\n\nข้อความย่อหน้าถัดไป'}),
  link('banner', 'image', {url: 'https://example.com/banner', content: {imageUrl: media, alt: 'ภาพสินค้า', buttonLabel: 'ดูสินค้า'}}),
  link('gallery', 'gallery', {content: {images: [{url: media, alt: 'ผลงานแรก', caption: 'คำอธิบายผลงาน'}], galleryLayout: 'grid'}}),
  link('service', 'service', {url: 'https://example.com/service', content: {imageUrl: media, alt: 'บริการของเรา', price: 'เริ่มต้น 990 บาท', buttonLabel: 'สอบถาม'}}),
];
const render = (props = {}) => renderToStaticMarkup(createElement(HubCanvas, {profile, links: blocks, slug: 'test-hub', ...props}));

test('public content routes outbound actions through tracking, while gallery enlargement has no outbound link', () => {
  const html = render();
  for (const id of ['old-link', 'banner', 'service']) assert.match(html, new RegExp(`href="/go/test-hub/${id}"`));
  for (const id of ['gallery', 'text', 'heading']) assert.doesNotMatch(html, new RegExp(`href="/go/test-hub/${id}"`));
  assert.doesNotMatch(html, /href="https:\/\/example\.com\//);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /alt="ผลงานแรก"/);
  assert.match(html, /คำอธิบายผลงาน/);
  assert.match(html, /เริ่มต้น 990 บาท/);
  assert.match(html, /<p>ข้อความย่อหน้าแรก<\/p><p>ข้อความย่อหน้าถัดไป<\/p>/);
});

test('studio previews never render tracked destinations and customer text remains escaped', () => {
  const html = render({preview: true, links: [...blocks, link('literal', 'text', {title: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>'})]});
  assert.doesNotMatch(html, /href="\/go\//);
  assert.match(html, /href="https:\/\/example\.com\/banner"/);
  assert.match(html, /href="https:\/\/example\.com\/service"/);
  assert.doesNotMatch(html, /<script>|<img src="?x/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('rich content is preserved through all 24 theme presets and hidden or archived blocks stay out of the page', () => {
  const links = [...blocks, link('hidden', 'image', {enabled: false, content: {imageUrl: '/media/hidden'}}), link('archived', 'service', {archived: true, content: {imageUrl: '/media/archived'}})];
  for (const theme of HUB_THEMES) {
    const html = render({profile: applyHubTheme(profile, theme.id), links});
    assert.match(html, new RegExp(`data-theme="${theme.id}"`));
    for (const type of ['text', 'image', 'gallery', 'service']) assert.match(html, new RegExp(`data-block-type="${type}"`));
    assert.doesNotMatch(html, /\/media\/hidden|\/media\/archived/);
    assert.match(html, /ธุรกิจทดสอบ/);
    assert.match(html, /alt="ภาพสินค้า"/);
  }
});


test('appearance tab renders selected theme and reassurance instead of crashing', () => {
  const selectedTheme = HUB_THEMES[0];
  const selectedProfile = {...profile, themeId: selectedTheme.id};
  const html = renderToStaticMarkup(createElement(HubThemeGallery, {
    profile: selectedProfile,
    links: blocks,
    savedThemeId: selectedTheme.id,
    dirty: false,
    busy: false,
    onChange: () => {},
    onPreview: () => {},
  }));
  assert.match(html, /เลือกสไตล์ที่เป็นคุณ/);
  assert.match(html, /เลือกอยู่/, 'selected theme must render its Check icon');
  assert.match(html, /เปลี่ยนธีมได้เสมอ/, 'footer must render its Check icon');
  assert.match(html, /เลือกธีมสำเร็จรูป/);
  assert.match(html, /ธีมพร้อมใช้/);
});


test('hundred-thousand and million-baht sale prices render without sharing the discount badge row',()=>{
  const sale = link('sale-car','service',{
    title:'รถตัวอย่าง',description:'Station Wagon / Estate',url:'https://example.com/car',sortOrder:1,
    content:{imageUrl:media,alt:'old alternate description',hasPromotion:true,
      originalPrice:'999000',salePrice:'699000',buttonLabel:'ดูสินค้า / ซื้อเลย'}
  });
  const regular = link('ordinary-shirt','service',{
    title:'เสื้อกีฬา',url:'https://example.com/shirt',sortOrder:2,
    content:{imageUrl:media,price:'฿120,000',buttonLabel:'ดูสินค้า / ซื้อเลย'}
  });
  const html=render({links:[sale,regular]});
  assert.match(html,/฿999,000/);
  assert.match(html,/฿699,000/);
  assert.match(html,/ลด 30%/);
  assert.match(html,/hcb-sale-price-compact/);
  assert.match(html,/hcb-regular-price-compact/);
  assert.match(html,/alt="รถตัวอย่าง"/,'product image alt should come from title, not editable alt text');
  assert.doesNotMatch(html,/alt="old alternate description"/);
  assert.match(html,/href="\/go\/test-hub\/sale-car"/);
  assert.match(html,/href="\/go\/test-hub\/ordinary-shirt"/);
});
test('very large prices remain complete in rendered output with responsive size class',()=>{
  const luxury=link('luxury','service',{
    title:'สินค้าราคาสูง',url:'https://example.com/luxury',
    content:{imageUrl:media,hasPromotion:true,originalPrice:'999999999.99',salePrice:'888888888.99'}
  });
  const html=render({links:[luxury]});
  assert.match(html,/hcb-sale-price-extra-long/);
  assert.match(html,/฿888,888,888\.99/);
  assert.match(html,/hcb-product-footer/);
});
