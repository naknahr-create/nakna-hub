import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderProductIds} from '../lib/hub-product-order.ts';

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
