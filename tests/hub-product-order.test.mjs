import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderProductIds,reorderTypedContentIds} from '../lib/hub-product-order.ts';

const links=[
  {id:'house',type:'service'},
  {id:'website',type:'link'},
  {id:'gym',type:'service'},
  {id:'heading',type:'heading'},
  {id:'hotel',type:'service'}
];
test('reordering inside the Studio product group leaves other link positions unchanged',()=>{
  assert.deepEqual(reorderProductIds(links,0,1),['gym','website','house','heading','hotel']);
  assert.deepEqual(reorderProductIds(links,2,-1),['house','website','hotel','heading','gym']);
});
test('reordering stays within the product group boundaries',()=>{
  assert.equal(reorderProductIds(links,0,-1),null);
  assert.equal(reorderProductIds(links,2,1),null);
  assert.equal(reorderProductIds(links,-1,1),null);
  assert.deepEqual(links.map(link=>link.id),['house','website','gym','heading','hotel']);
});

test('Studio nests products under one collection while retaining independent editors', async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../app/components/HubStudio.tsx',import.meta.url),'utf8');
  assert.match(source,/className="hs-product-collection"/);
  assert.match(source,/productLinks\.map\(\(product,productIndex\)/);
  assert.match(source,/onReorder=\{reorderProduct\}/);
  assert.match(source,/setNewBlockAfterId\(type==="service"\?/);
  assert.equal((source.match(/เพิ่มสินค้าอีกรายการ/g)||[]).length,1);
  assert.doesNotMatch(source,/onAddProduct/);
});

test('reordering affiliate promotions never reorders existing services or links',()=>{
  const rows=[
    {id:'offer1',type:'promotion'},{id:'service1',type:'service'},
    {id:'link1',type:'link'},{id:'offer2',type:'promotion'}
  ];
  assert.deepEqual(reorderTypedContentIds(rows,'promotion',0,1),['offer2','service1','link1','offer1']);
  assert.equal(reorderTypedContentIds(rows,'promotion',1,1),null);
});
test('promotion cards share a Studio parent card and a separate public carousel',async()=>{
  const {readFileSync}=await import('node:fs');
  const studio=readFileSync(new URL('../app/components/HubStudio.tsx',import.meta.url),'utf8');
  const canvas=readFileSync(new URL('../app/components/HubCanvas.tsx',import.meta.url),'utf8');
  assert.match(studio,/className="hs-product-collection hs-promotion-collection"/);
  assert.match(studio,/promotionLinks\.map\(\(promotion,promotionIndex\)/);
  assert.match(studio,/เพิ่มโปรโมชั่นอีกชิ้น/);
  assert.match(canvas,/promoCards=visible\.filter/);
  assert.match(canvas,/hc-promotion-showcase/);
});
