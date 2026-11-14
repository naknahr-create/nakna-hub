import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderProductIds,reorderTypedContentIds} from '../lib/hub-product-order.ts';
import {readFileSync} from 'node:fs';

const links=[
  {id:'house',type:'service'},
  {id:'website',type:'link'},
  {id:'gym',type:'service'},
  {id:'heading',type:'heading'},
  {id:'hotel',type:'service'}
];

test('reordering Studio product rows leaves all non-product positions unchanged',()=>{
  assert.deepEqual(reorderProductIds(links,0,1),['gym','website','house','heading','hotel']);
  assert.deepEqual(reorderProductIds(links,2,-1),['house','website','hotel','heading','gym']);
  assert.equal(reorderProductIds(links,0,-1),null);
  assert.equal(reorderProductIds(links,2,1),null);
  assert.deepEqual(links.map(link=>link.id),['house','website','gym','heading','hotel']);
});

test('normal and discounted products reorder together, without affecting unrelated links',()=>{
  const mixed=[
    {id:'serviceA',type:'service'},
    {id:'link',type:'link'},
    {id:'discountedA',type:'promotion'},
    {id:'heading',type:'heading'},
    {id:'serviceB',type:'service'},
    {id:'discountedB',type:'promotion'},
  ];
  assert.deepEqual(reorderProductIds(mixed,0,1),
    ['discountedA','link','serviceA','heading','serviceB','discountedB']);
  assert.deepEqual(reorderProductIds(mixed,2,1),
    ['serviceA','link','discountedA','heading','discountedB','serviceB']);
  assert.equal(reorderProductIds(mixed,3,1),null);
  // Typed helper remains available for historical/restricted operations.
  assert.deepEqual(reorderTypedContentIds(mixed,'promotion',0,1),
    ['serviceA','link','discountedB','heading','serviceB','discountedA']);
});

test('Studio has a single product action and optional discount switch, no extra content type',()=>{
  const studio=readFileSync(new URL('../app/components/HubStudio.tsx',import.meta.url),'utf8');
  const editor=readFileSync(new URL('../app/components/HubContentEditor.tsx',import.meta.url),'utf8');
  const style=readFileSync(new URL('../app/content-editor.css',import.meta.url),'utf8');
  assert.match(studio,/const productLinks=links\.filter\(link=>link\.type==='service'\|\|link\.type==='promotion'\)/);
  assert.equal((studio.match(/className="hs-product-collection"/g)||[]).length,1);
  assert.doesNotMatch(studio,/hs-promotion-collection|addPromotionAfter/);
  assert.match(studio,/productLinks\.map\(\(product,productIndex\)/);
  assert.match(studio,/onReorder=\{reorderProduct\}/);
  assert.match(studio,/addProductAfter\(productLinks\[0\]\.id\)/);
  assert.equal((studio.match(/เพิ่มสินค้าอีกรายการ/g)||[]).length,1);
  assert.doesNotMatch(studio,/เพิ่มสินค้าลดราคา/);
  assert.doesNotMatch(editor,/\{type:"promotion",label:/);
  assert.equal((editor.match(/\{type:"(?:image|gallery|service|link|text|heading)",label:/g)||[]).length,6);
  assert.match(editor,/className="hce-discount-switch"/);
  assert.match(editor,/aria-checked=\{discountEnabled\}/);
  assert.match(editor,/role="switch"/);
  assert.match(editor,/\{discountEnabled&&<section className="hce-promo-pricing"/);
  assert.match(editor,/\{\(draft\.type==="service"\|\|draft\.type==="promotion"\)&&!discountEnabled&&/);
  assert.match(editor,/const legacy=link\.type==="promotion"/);
  assert.match(style,/\.hce-discount-setting/);
});

test('public Hub places all products in one rail without heading or promotion badge',()=>{
  const canvas=readFileSync(new URL('../app/components/HubCanvas.tsx',import.meta.url),'utf8');
  const carousel=readFileSync(new URL('../app/components/HubCardCarousel.tsx',import.meta.url),'utf8');
  const card=readFileSync(new URL('../app/components/HubContentBlock.tsx',import.meta.url),'utf8');
  assert.match(canvas,/const productCards=visible\.filter\(l=>l\.type==='service'\|\|l\.type==='promotion'\)/);
  assert.equal((canvas.match(/<HubCardCarousel/g)||[]).length,1);
  assert.match(canvas,/<HubCardCarousel key=\{l\.id\} blocks=\{productCards\} compact/);
  assert.doesNotMatch(canvas,/hc-promotion-showcase|promoCards/);
  assert.doesNotMatch(card,/>โปรโมชั่น</);
  assert.match(card,/hcb-promo-discount/);
  assert.match(carousel,/const label='สินค้าและบริการ'/);
});

test('single card uses a balanced responsive hero; multiple products are small swipe tiles',()=>{
  const css=readFileSync(new URL('../app/hub-content.css',import.meta.url),'utf8');
  const carousel=readFileSync(new URL('../app/components/HubCardCarousel.tsx',import.meta.url),'utf8');
  assert.match(carousel,/hc-card-carousel-single/);
  assert.match(carousel,/hc-card-carousel-compact/);
  assert.match(carousel,/ResizeObserver/);
  assert.match(carousel,/function stepCompact\(/);
  assert.match(carousel,/aria-label="สินค้าถัดไป"/);
  assert.match(css,/\.hc \.hc-card-carousel-compact \.hc-card-slide/);
  assert.match(css,/scroll-snap-type:x mandatory/);
  assert.match(css,/overflow-x:auto/);
  assert.match(css,/clamp\(186px,58%,218px\)/);
  assert.match(css,/\.hc \.hc-card-carousel-single \.hc-card-slide:only-child/);
  assert.match(css,/grid-template-columns:minmax\(140px,40%\) minmax\(0,1fr\)/);
  assert.match(css,/@media\(max-width:560px\)/);
});

test('discount works for a normal product and keeps historic promotion records readable',async()=>{
  const helper=await import('../lib/hub-promotion.ts');
  assert.equal(helper.isProductDiscountEnabled('service',{hasPromotion:false}),false);
  assert.equal(helper.isProductDiscountEnabled('service',{hasPromotion:true}),true);
  assert.equal(helper.isProductDiscountEnabled('promotion',{originalPrice:'100',salePrice:'80'}),true);
  assert.equal(helper.getPromotionPricing('100','80').discountPercent,20);
  // Source-level check of the renderer, without mounting the app's upload controls.
  const card=readFileSync(new URL('../app/components/HubContentBlock.tsx',import.meta.url),'utf8');
  assert.match(card,/isProductDiscountEnabled\(block\.type,content\)/);
  assert.match(card,/discountEnabled&&block\.type==='service'\?'hcb-promotion'/);
  assert.match(card,/\{promo&&<div className="hcb-promo-prices"/);
  assert.match(card,/!discountEnabled&&content\.price/);
});
