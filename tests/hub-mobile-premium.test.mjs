import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const studio=file('app/components/HubStudio.tsx');
const studioStyles=file('app/studio.css');
const teamsStyles=file('app/teams.css');
const billing=file('app/components/HubBilling.tsx');
const billingStyles=file('app/billing.css');
const line=file('app/components/LineNotifications.tsx');
const lineStyles=file('app/line-notifications.css');

test('mobile navigation keeps the same accessible four screens without losing routes',()=>{
  assert.match(studio,/aria-label="สตูดิโอ"/);
  for (const route of ['pages','teams','account','billing']) assert.match(studio,new RegExp('navigate\\("'+route+'"\\)'));
  assert.match(studio,/className="hs-nav-tail"/);
  assert.match(studioStyles,/\.hs-sidebar nav button\.active>svg/);
  assert.match(studioStyles,/@media\(max-width:600px\)/);
});

test('hub management has compact actionable controls with accessible secondary actions',()=>{
  assert.match(studio,/hs-card-more-trigger/);
  assert.match(studio,/aria-expanded=\{openCardMenu===page\.id\}/);
  assert.match(studio,/hs-card-secondary-menu/);
  assert.match(studio,/onClick=\{\(\)=>void openEditor\(page\.id\)\}/);
  assert.match(studio,/onClick=\{\(\)=>void copyPage\(page\)\}/);
  assert.match(studio,/onClick=\{\(\)=>setArchivePage\(/);
  assert.match(studioStyles,/\.hs-card-secondary-menu\[data-open="false"\]/);
  assert.match(studioStyles,/\.hs-home-main \.hs-workspace-metrics/);
});

test('LINE notification settings remain functional when advanced controls collapse on mobile',()=>{
  assert.match(line,/ln-advanced-toggle/);
  assert.match(line,/aria-controls="ln-advanced-settings"/);
  assert.match(line,/ln-advanced-body/);
  assert.match(line,/ln-save-row/);
  assert.match(line,/onClick=\{\(\) => void save\(\)\}/);
  assert.match(line,/onClick=\{\(\) => void showPreview\(true\)\}/);
  assert.match(lineStyles,/\.ln-advanced-body:not\(\.is-open\)/);
});

test('current Pro membership stays immediately available, with optional package details',()=>{
  assert.match(billing,/showComparison/);
  assert.match(billing,/hb-compare-toggle/);
  assert.match(billing,/hb-feature-toggle/);
  assert.match(billing,/hb-extra-benefits/);
  assert.match(billing,/onClick=\{\(\) => void openStripe\("portal"\)\}/);
  assert.match(billing,/onClick=\{\(\) => void openStripe\("checkout"\)\}/);
  assert.match(billingStyles,/\.hb-feature-content:not\(\.is-open\)/);
  assert.match(billingStyles,/\.hb-extra-body:not\(\.is-open\)/);
});

test('team cards are compact while preserving member invitation workflow',()=>{
  const teams=file('app/components/HubTeams.tsx');
  assert.match(teams,/onClick=\{startCreate\}/);
  assert.match(teams,/setInviting\(true\)/);
  assert.match(teamsStyles,/\.ht-team-card\{/);
  assert.match(teamsStyles,/\.ht-heading\{/);
});
