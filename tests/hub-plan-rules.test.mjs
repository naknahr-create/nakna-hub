import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUB_MAX_IMAGE_BYTES,
  HUB_STARTER_LINK_LIMIT,
  HUB_STORAGE_LIMIT_BYTES,
  canCreateContent,
  publishedLinksForPlan,
  publishedProfileForPlan,
} from '../lib/hub-plan-rules.ts';

const profile={
  name:'Creator',handle:'@creator',tagline:'',bio:'',
  avatarUrl:'/media/old-photo',shareImageUrl:'/media/old-cover',
  accent:'#04878a',theme:'light',layout:'stack',background:'mint',showBranding:false,
};
const links=[
  {type:'gallery',icon:'link',id:'gallery'},
  {type:'link',icon:'image:abc',id:'custom-image-icon'},
  {type:'link',icon:'auto',id:'auto-icon'},
  {type:'image',icon:'link',id:'photo'},
  {type:'link',icon:'facebook',id:'facebook'},
  {type:'link',icon:'line',id:'line'},
  {type:'link',icon:'tiktok',id:'tiktok'},
  {type:'link',icon:'youtube',id:'youtube'},
];

test('Free permits only ordinary links, including manual and automatic site icons',()=>{
  for(const type of ['heading','text','image','gallery','service','promotion']){
    assert.equal(canCreateContent('starter',type),false);
    assert.equal(canCreateContent('pro',type),true);
  }
  assert.equal(canCreateContent('starter','link'),true);
});

test('Storage quotas are 0 for Free and 2 GiB for Pro; each image is at most 2 MiB',()=>{
  assert.equal(HUB_STORAGE_LIMIT_BYTES.starter,0);
  assert.equal(HUB_STORAGE_LIMIT_BYTES.pro,2*1024**3);
  assert.equal(HUB_MAX_IMAGE_BYTES,2*1024**2);
  assert.equal(HUB_STARTER_LINK_LIMIT,5);
});

test('Downgrade masks premium media without mutating saved content',()=>{
  const saved=JSON.stringify({profile,links});
  const publicProfile=publishedProfileForPlan(profile,'starter');
  assert.equal(publicProfile.avatarUrl,'');
  assert.equal(publicProfile.shareImageUrl,'');
  assert.equal(publicProfile.showBranding,true);
  const publicLinks=publishedLinksForPlan(links,'starter');
  assert.deepEqual(publicLinks.map(link=>link.id),['custom-image-icon','auto-icon','facebook','line','tiktok']);
  assert.equal(publicLinks[0].icon,'auto');
  assert.equal(publicLinks[2].icon,'facebook');
  assert.equal(JSON.stringify({profile,links}),saved);
});

test('Pro restores all previously saved images, blocks, and branding',()=>{
  assert.strictEqual(publishedProfileForPlan(profile,'pro'),profile);
  assert.strictEqual(publishedLinksForPlan(links,'pro'),links);
});
