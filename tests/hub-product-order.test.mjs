import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderProductIds,reorderTypedContentIds,reorderProductGroupIds} from '../lib/hub-product-order.ts';
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
  assert.match(css,/flex:0 0 calc\(50% - 5px\)/);
  assert.match(css,/flex-basis:calc\(50% - 5px\)/);
  assert.match(css,/\.hc \.hc-card-carousel-single \.hc-card-slide:only-child/);
  assert.match(css,/\.hc \.hc-card-carousel-single \.hcb-product-stage/);
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


test('moving the entire product rail operates on the visible group, not a single product',()=>{
  // The two product records are interspersed in storage, but visually share one carousel.
  const mixed=[
    {id:'one',type:'link'},
    {id:'two',type:'heading'},
    {id:'productA',type:'promotion'},
    {id:'three',type:'link'},
    {id:'productB',type:'service'},
    {id:'four',type:'link'},
  ];
  assert.deepEqual(reorderProductGroupIds(mixed,'top'),
    ['productA','productB','one','two','three','four']);
  assert.deepEqual(reorderProductGroupIds(mixed,'up'),
    ['one','productA','productB','two','three','four']);
  assert.deepEqual(reorderProductGroupIds(mixed,'down'),
    ['one','two','three','productA','productB','four']);
  assert.deepEqual(mixed.map(row=>row.id),
    ['one','two','productA','three','productB','four'],
    'original positions must not mutate before a successful save');
});

test('move group boundary conditions keep controls disabled when no move is possible',()=>{
  const atTop=[
    {id:'service',type:'service'},{id:'discount',type:'promotion'},
    {id:'about',type:'text'}
  ];
  const atBottom=[
    {id:'about',type:'text'},{id:'heading',type:'heading'},
    {id:'discount',type:'promotion'},{id:'service',type:'service'}
  ];
  assert.equal(reorderProductGroupIds(atTop,'top'),null);
  assert.equal(reorderProductGroupIds(atTop,'up'),null);
  assert.deepEqual(reorderProductGroupIds(atTop,'down'),['about','service','discount']);
  assert.equal(reorderProductGroupIds(atBottom,'down'),null);
  assert.equal(reorderProductGroupIds([], 'top'),null);
  assert.equal(reorderProductGroupIds([{id:'text',type:'text'}],'top'),null);
});

test('Studio exposes explicit move-to-top, up, down buttons for the entire product card',()=>{
  const studio=readFileSync(new URL('../app/components/HubStudio.tsx',import.meta.url),'utf8');
  const style=readFileSync(new URL('../app/content-editor.css',import.meta.url),'utf8');
  assert.match(studio,/aria-label="เลื่อนตำแหน่งกลุ่มสินค้า"/);
  assert.match(studio,/aria-label="ย้ายกลุ่มสินค้าขึ้นบนสุด"/);
  assert.match(studio,/aria-label="เลื่อนกลุ่มสินค้าขึ้น"/);
  assert.match(studio,/aria-label="เลื่อนกลุ่มสินค้าลง"/);
  assert.match(studio,/reorderProductGroupIds\(links,"top"\)/);
  assert.match(studio,/reorderProductGroupIds\(links,"up"\)/);
  assert.match(studio,/reorderProductGroupIds\(links,"down"\)/);
  assert.match(studio,/moveProductGroup\("top"\)/);
  assert.match(studio,/moveProductGroup\("up"\)/);
  assert.match(studio,/moveProductGroup\("down"\)/);
  assert.match(style,/\.hs-product-group-order/);
});

test('mixed product tiles keep prices and actions in their own overlay/footer regions',()=>{
  const css=readFileSync(new URL('../app/hub-content.css',import.meta.url),'utf8');
  const card=readFileSync(new URL('../app/components/HubContentBlock.tsx',import.meta.url),'utf8');
  assert.match(css,/\.hc \.hc-card-carousel-compact \.hcb-product-stage/);
  assert.match(css,/\.hc \.hc-card-carousel-compact \.hcb-product-footer/);
  assert.match(css,/background:rgba\(255,255,255,\.93\)/);
  assert.match(css,/\.hc \.hc-card-carousel-compact \.hcb-product-price-slot/);
  assert.match(card,/hcb-product-overlay hcb-product-body/);
  assert.match(card,/hcb-product-action-slot/);
});

test('same-height products share title, description, price and CTA rows without a disclaimer',()=>{
  const content=readFileSync(new URL('../app/components/HubContentBlock.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../app/hub-content.css',import.meta.url),'utf8');
  assert.match(content,/hcb-product-body/);
  assert.match(content,/hcb-product-description-slot/);
  assert.match(content,/hcb-product-price-slot/);
  assert.match(content,/hcb-product-action-slot/);
  assert.match(content,/\{promo&&<div className="hcb-promo-prices"/);
  assert.match(content,/block.type==='service'&&!discountEnabled&&content.price/);
  assert.doesNotMatch(content,/hcb-promo-disclosure/);
  assert.doesNotMatch(content,/ลิงก์แนะนำสินค้า · ราคาและส่วนลดอาจเปลี่ยนตามร้านค้า/);
  assert.match(css,/\.hcb-product-stage/);
  assert.match(css,/\.hcb-product-action-slot>\.hcb-action/);
  assert.match(css,/\.hcb-product-price-slot>\.hcb-price/);
  assert.match(css,/\.hc-card-carousel-single \.hcb-product-overlay/);
});

test('non-product content cards retain image/gallery actions unaffected by shared price slots',()=>{
  const content=readFileSync(new URL('../app/components/HubContentBlock.tsx',import.meta.url),'utf8');
  assert.match(content,/block.type==='gallery'&&/);
  assert.match(content,/:action&&<div className="hcb-bottom">\{action\}<\/div>/);
  assert.match(content,/hasAction\?<a href=\{href\}/);
});


test('exactly two products fit the preview width with tall bright imagery',()=>{
  const css=readFileSync(new URL('../app/hub-content.css',import.meta.url),'utf8');
  const markup=readFileSync(new URL('../app/components/HubContentBlock.tsx',import.meta.url),'utf8');
  assert.match(css,/flex:0 0 calc\(50% - 5px\)/);
  assert.match(css,/width:calc\(50% - 5px\)/);
  assert.match(css,/flex:0 0 244px/);
  assert.match(css,/height:244px/);
  assert.match(css,/height:44px/);
  assert.match(css,/max-height:15px/);
  assert.match(css,/\.hc \.hc-card-carousel-compact \.hcb-product-footer/);
  assert.match(markup,/hcb-product-price-slot/);
  assert.match(markup,/hcb-product-action-slot/);
  assert.match(markup,/hcb-promo-discount/);
  assert.doesNotMatch(markup,/hcb-promo-disclosure/);
});

test('single-product full-width layout remains separate from mini carousel',()=>{
  const css=readFileSync(new URL('../app/hub-content.css',import.meta.url),'utf8');
  assert.match(css,/\.hc \.hc-card-carousel-single \.hc-card-slide>.hcb/);
  assert.match(css,/\.hc \.hc-card-carousel-single \.hcb-product-stage/);
  assert.match(css,/\.hc \.hc-card-carousel-single \.hcb-product-overlay/);
  const carousel=readFileSync(new URL('../app/components/HubCardCarousel.tsx',import.meta.url),'utf8');
  assert.match(carousel,/singleCard=compactCards&&blocks.length===1/);
  assert.match(carousel,/blocks.length>1&&/);
});


test('product picture and text overlap only in the image stage, never over the white CTA footer',()=>{
 const card=readFileSync(new URL('../app/components/HubContentBlock.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/hub-content.css',import.meta.url),'utf8');
 const inStage=card.slice(card.indexOf('className="hcb-product-stage"'),card.indexOf('className="hcb-product-footer"'));
 const footerStart=card.indexOf('className="hcb-product-footer"');
 const footerEnd=card.indexOf('</>:<>',footerStart);
 assert.ok(footerStart>=0&&footerEnd>footerStart,'product footer is a sibling of the photo stage');
 const inFooter=card.slice(footerStart,footerEnd);
 assert.match(inStage,/hcb-product-photo/);
 assert.match(inStage,/hcb-product-overlay hcb-product-body/);
 assert.match(inStage,/hcb-product-price-slot/);
 assert.doesNotMatch(inStage,/hcb-product-action-slot/);
 assert.match(inFooter,/hcb-product-action-slot/);
 assert.match(inFooter,/\{action\}/);
 assert.match(css,/\.hc \.hc-card-carousel-compact \.hcb-product-footer/);
 assert.match(css,/background:#fff;/);
 assert.match(css,/border-top:1px solid #e8eef0/);
 assert.match(css,/\.hc \.hc-card-carousel-compact \.hcb-product-overlay/);
 assert.match(css,/background:rgba\(255,255,255,\.93\)/);
 assert.doesNotMatch(css.slice(css.indexOf('NAKNA HUB · Clean Editorial Commerce')),/linear-gradient\(/);
});

test('exactly two products fill one row and navigation appears only when overflowing',()=>{
 const css=readFileSync(new URL('../app/hub-content.css',import.meta.url),'utf8');
 const carousel=readFileSync(new URL('../app/components/HubCardCarousel.tsx',import.meta.url),'utf8');
 assert.match(css,/flex:0 0 calc\(50% - 5px\)/);
 assert.match(css,/width:calc\(50% - 5px\)/);
 assert.match(css,/height:244px/);
 assert.match(css,/min-height:62px/);
 assert.match(carousel,/!compactCards\|\|edges\.prev\|\|edges\.next/);
 assert.match(carousel,/onScroll=\{readPosition\}/);
 assert.match(carousel,/function stepCompact\(/);
});


test('Studio photo framing offers compact live preview with focus and zoom controls',()=>{
  const editor=readFileSync(new URL('../app/components/HubContentEditor.tsx',import.meta.url),'utf8');
  const style=readFileSync(new URL('../app/content-editor.css',import.meta.url),'utf8');
  const render=readFileSync(new URL('../app/components/HubContentBlock.tsx',import.meta.url),'utf8');
  assert.match(editor,/<details className="hce-photo-framing">/);
  assert.match(editor,/imageFocusX:Number\(event\.target\.value\)/);
  assert.match(editor,/imageFocusY:Number\(event\.target\.value\)/);
  assert.match(editor,/imageZoom:Number\(event\.target\.value\)/);
  assert.match(editor,/imageFocusX:50,imageFocusY:35,imageZoom:100/);
  assert.match(editor,/content\.fit\|\|"contain"/);
  assert.match(style,/\.hce-photo-framing-preview/);
  assert.match(render,/focusX=\{isProduct\?content\.imageFocusX\?\?50:undefined\}/);
  assert.match(render,/objectPosition/);
  assert.match(render,/transformOrigin/);
});


test('frosted product information panels stay equal height even when description or discount is absent',()=>{
  const css=readFileSync(new URL('../app/hub-content.css',import.meta.url),'utf8');
  const card=readFileSync(new URL('../app/components/HubContentBlock.tsx',import.meta.url),'utf8');
  const clean=css.slice(css.indexOf('/* NAKNA HUB · Clean Editorial Commerce'));
  assert.match(clean,/grid-template-rows:34px 16px 52px/);
  assert.match(clean,/height:136px;\s*min-height:136px;\s*max-height:136px/);
  assert.match(clean,/height:34px;\s*min-height:34px;\s*max-height:34px/);
  assert.match(clean,/\.hcb-product-description-slot:empty\{\s*display:block/);
  assert.match(clean,/height:16px;\s*min-height:16px;\s*max-height:16px/);
  assert.match(clean,/\.hcb-product-price-slot:empty\{\s*display:flex/);
  assert.match(clean,/height:52px;\s*min-height:52px;\s*max-height:52px/);
  assert.match(card,/className="hcb-product-description-slot"/);
  assert.match(card,/className="hcb-product-price-slot"/);
  assert.match(card,/\{promo&&<div className="hcb-promo-prices"/);
  assert.match(card,/block.type==='service'&&!discountEnabled&&content.price/);
});

test('single-product white information panel also has reserved title, description and price rows',()=>{
  const css=readFileSync(new URL('../app/hub-content.css',import.meta.url),'utf8');
  const clean=css.slice(css.indexOf('/* NAKNA HUB · Clean Editorial Commerce'));
  assert.match(clean,/grid-template-rows:46px 20px 56px/);
  assert.match(clean,/height:160px;\s*min-height:160px;\s*max-height:160px/);
  assert.match(clean,/height:46px;\s*min-height:46px;\s*max-height:46px/);
  assert.match(clean,/height:20px;\s*min-height:20px;\s*max-height:20px/);
  assert.match(clean,/height:56px;\s*min-height:56px;\s*max-height:56px/);
  assert.match(clean,/\.hc \.hc-card-carousel-compact \.hcb-product-footer/);
  assert.match(clean,/background:#fff;/);
  assert.match(clean,/flex:0 0 calc\(50% - 5px\)/);
});
