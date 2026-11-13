import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';

// Real application modules and SQLite migrations; only the Workers environment
// and R2 storage are local adapters. No provider or public network requests.
const root = new URL('../', import.meta.url), testEnv = {};
const environmentKey = Symbol.for('nakna-hub.pro-admin.environment');
globalThis[environmentKey] = testEnv;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {
      url: 'data:text/javascript,export const env=globalThis[Symbol.for("nakna-hub.pro-admin.environment")];', shortCircuit: true,
    };
    const candidate = specifier.startsWith('@/') ? new URL(specifier.slice(2), root)
      : specifier.startsWith('.') && context.parentURL?.startsWith(root.href) ? new URL(specifier, context.parentURL) : null;
    if (candidate) {
      const file = candidate.pathname.endsWith('.ts') ? candidate : new URL(candidate.href + '.ts');
      if (existsSync(file)) return {url: file.href, shortCircuit: true};
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(root.href) && url.endsWith('.ts')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
      }).outputText,
    };
    return nextLoad(url, context);
  },
});
const {authenticateHubRequest} = await import('../lib/hub-auth.ts');
const {createPage, createLink, updateLink, getPage, updatePage, publishPage, archiveLink, unpublishPage,
  uploadAsset, serveAsset, getPublicHub, recordView, goToLink, analytics, exportAnalytics, getWorkspace, setAccountPlan} = await import('../lib/hub-data.ts');
const {adminOverview,adminAccounts,adminHubs,adminAudit,adminUpdateAccount,adminUpdateHub}=await import('../lib/hub-admin.ts');
const ORIGIN = 'https://hub.example.com', CHANNEL = '1234567890';
const OWNER_A = `line:${CHANNEL}:U${'a'.repeat(32)}`, OWNER_B = `line:${CHANNEL}:U${'b'.repeat(32)}`;
const COOKIE_A = 'a'.repeat(43), COOKIE_B = 'b'.repeat(43);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/4N8AAAAASUVORK5CYII=', 'base64');
const databases = [];
after(() => {
  hooks.deregister(); delete globalThis[environmentKey];
  for (const sql of databases) sql.close();
});
function sqlite() {
  const sql = new DatabaseSync(':memory:'); databases.push(sql); sql.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync(new URL('drizzle/', root)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sql.exec(readFileSync(new URL('drizzle/' + name, root), 'utf8'));
  }
  const statement = (query, values = []) => ({query, values,
    bind(...args) {return statement(query, args);},
    async first(column) {const row = sql.prepare(query).get(...values); return row ? column ? row[column] : {...row} : null;},
    async all() {return {results: sql.prepare(query).all(...values).map(row => ({...row})), success: true};},
    async run() {return this.execute();},
    execute() {const result = sql.prepare(query).run(...values); return {success: true, meta: {changes: Number(result.changes)}};},
  });
  return {sql, prepare: statement, async batch(statements) {
    sql.exec('BEGIN');
    try {const result = statements.map(s => s.execute()); sql.exec('COMMIT'); return result;}
    catch (error) {sql.exec('ROLLBACK'); throw error;}
  }};
}
function setup() {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  const objects = new Map();
  const bucket = {
    async put(key, bytes, options) {objects.set(key, {bytes: new Uint8Array(bytes), options});},
    async get(key) {const value = objects.get(key); return value ? {body: new Response(value.bytes).body, size: value.bytes.length} : null;},
    async delete(key) {objects.delete(key);},
  };
  Object.assign(testEnv, {DB: sqlite(), BUCKET: bucket, APP_ORIGIN: ORIGIN,
    LINE_LOGIN_CHANNEL_ID: CHANNEL, LINE_LOGIN_CHANNEL_SECRET: 'TEST_MEDIA_SECRET_NOT_REAL'});
  const now = Date.now();
  for (const [user, token] of [[OWNER_A, COOKIE_A], [OWNER_B, COOKIE_B]]) {
    testEnv.DB.sql.prepare(`INSERT INTO hub_line_sessions
      (token_hash,user_id,line_user_id,login_channel_id,origin,display_name,email,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(createHash('sha256').update(token).digest('hex'), user, user.split(':')[2], CHANNEL,
        ORIGIN, user === OWNER_A ? 'Owner A' : 'Owner B', '', now, now + 600000);
  }
  return {db: testEnv.DB.sql, objects};
}
async function request(path, {actor = 'a', method = 'GET', body, headers = {}} = {}) {
  // These existing fixtures model a freshly loaded client. Missing and stale
  // revisions are tested explicitly in hub-teams.test.mjs instead of auto-filled.
  const url = new URL(path, ORIGIN);
  const pageMatch = /^\/api\/pages\/([0-9a-f-]+)(?:\/(?:links(?:\/[0-9a-f-]+)?|reorder|publish|unpublish))?$/.exec(url.pathname);
  if (pageMatch && ['POST', 'PATCH', 'DELETE'].includes(method)) {
    const row = testEnv.DB.sql.prepare('SELECT revision FROM hub_pages WHERE id=?').get(pageMatch[1]);
    if (row && method === 'DELETE' && !url.searchParams.has('revision')) url.searchParams.set('revision', String(row.revision));
    else if (row && method !== 'DELETE') body = {revision: row.revision, ...body};
    path = url.pathname + url.search;
  }
  const token = actor === 'a' ? COOKIE_A : actor === 'b' ? COOKIE_B : '';
  return authenticateHubRequest(new Request(ORIGIN + path, {method,
    headers: {...(token ? {Cookie: '__Host-nakna_session=' + token} : {}),
      ...(body !== undefined && !(body instanceof FormData) ? {'Content-Type': 'application/json'} : {}),
      ...(method !== 'GET' && method !== 'HEAD' ? {Origin: ORIGIN} : {}), ...headers},
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  }), testEnv);
}
async function page(actor = 'a') {
  const result=await createPage(await request('/api/pages', {actor, method: 'POST', body: {name: 'Hub ' + actor, slug: 'owner-' + actor, template: 'creator'}}));
  return result;
}
async function link(pageId, options = {}, actor = 'a') {
  return createLink(await request('/api/pages/' + pageId + '/links', {actor, method: 'POST', body: {
    title: 'A website', url: 'https://example.com/store', ...options,
  }}), pageId);
}
async function upload(actor = 'a', blob = new Blob([PNG], {type: 'image/png'})) {
  const form = new FormData(); form.append('file', blob, 'icon.png');
  return uploadAsset(await request('/api/uploads', {actor, method: 'POST', body: form}));
}
async function publish(pageId, actor = 'a') {
  return publishPage(await request('/api/pages/' + pageId + '/publish', {actor, method: 'POST', body: {}}), pageId);
}
async function readAnalytics(pageId, query = 'range=all', actor = 'a') {
  return analytics(await request('/api/pages/' + pageId + '/analytics?' + query, {actor}), pageId);
}
function event(db, pageId, type, linkId = null, time = Date.now(), device = 'มือถือ', source = 'LINE') {
  db.prepare('INSERT INTO hub_events (id,page_id,type,link_id,created_at,device,source) VALUES (?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), pageId, type, linkId, time, device, source);
}

async function account(actor='a') {return (await getWorkspace(await request('/api/workspace',{actor}))).account;}
function paid(db,id,{status='active',live=1,end=Date.now()+86400000,interval='month',cancel=0}={}){
  db.prepare("UPDATE hub_accounts SET plan='pro' WHERE id=?").run(id);
  db.prepare('INSERT INTO hub_billing_accounts(account_id,managed,updated_at) VALUES (?,1,?) ON CONFLICT(account_id) DO UPDATE SET managed=1').run(id,Date.now());
  db.prepare('DELETE FROM hub_billing_subscriptions WHERE account_id=?').run(id);
  db.prepare('INSERT INTO hub_billing_subscriptions VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('sub_'+id,id,'cus_'+id,'price_'+interval,interval,status,end,end,cancel,live,Date.now());
}
async function bindOperator(db){const a=await account();db.prepare('INSERT INTO hub_operators VALUES (?,?,?)').run('operator',OWNER_A,Date.now());return a;}
const proRequired=e=>e.status===403&&e.extra?.code==='analytics_pro_required';

test('Starter events continue recording; summaries redact counts and paid upgrade unlocks actual history',async()=>{
  const {db}=setup(),p=await page(),l=await link(p.page.id);await publish(p.page.id);
  const view=crypto.randomUUID();
  await recordView(await request('/api/events',{actor:null,method:'POST',body:{type:'view',pageId:p.page.id,id:view},headers:{'User-Agent':'Mozilla/5.0'}}));
  await goToLink(await request('/go/owner-a/'+l.id,{actor:null,headers:{'User-Agent':'Mozilla/5.0'}}),'owner-a',l.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_events').get().n,2);
  const workspace=await getWorkspace(await request('/api/workspace'));
  assert.deepEqual(workspace.account.entitlements,{analytics:false,lineDigest:false});
  assert.equal(workspace.usage.totalClicks,null);assert.equal(workspace.pages[0].totalClicks,null);assert.equal(workspace.pages[0].totalViews,null);
  const editor=await getPage(await request('/api/pages/'+p.page.id),p.page.id);assert.equal(editor.page.totalClicks,null);
  await assert.rejects(readAnalytics(p.page.id),proRequired);
  await assert.rejects(exportAnalytics(await request('/api/pages/'+p.page.id+'/analytics/export'),p.page.id),proRequired);
  paid(db,workspace.account.id);
  const unlocked=await readAnalytics(p.page.id);assert.equal(unlocked.totalViews,1);assert.equal(unlocked.totalClicks,1);
  const after=await getWorkspace(await request('/api/workspace'));assert.equal(after.usage.totalClicks,1);assert.equal(after.account.entitlements.analytics,true);
});
test('manual Pro, test subscriptions, expired access and canceled subscriptions never unlock analytics',async()=>{
  const {db}=setup(),p=await page(),a=await account();
  db.prepare("UPDATE hub_accounts SET plan='pro' WHERE id=?").run(a.id);
  await assert.rejects(readAnalytics(p.page.id),proRequired);
  for(const options of [{live:0},{end:Date.now()-1},{status:'canceled'},{status:'unpaid'},{status:'trialing'}]){
    paid(db,a.id,options);await assert.rejects(readAnalytics(p.page.id),proRequired);
    assert.equal((await getWorkspace(await request('/api/workspace'))).pages[0].totalClicks,null);
  }
  paid(db,a.id,{status:'past_due',cancel:1});assert.equal((await readAnalytics(p.page.id)).totalClicks,0);
  paid(db,a.id,{cancel:1});assert.equal((await readAnalytics(p.page.id)).totalViews,0,'period-end cancellation keeps paid access');
});
test('paid analytics keep tenant ownership and verified identity checks',async()=>{
  const {db}=setup(),a=await page(),b=await page('b');paid(db,(await account()).id);paid(db,(await account('b')).id);
  await assert.rejects(readAnalytics(a.page.id,'range=all','b'),e=>e.status===404);
  await assert.rejects(readAnalytics(b.page.id,'range=all','a'),e=>e.status===404);
  await assert.rejects(readAnalytics(a.page.id,'range=all',null),e=>e.status===401);
  const forged=await request('/api/operator',{actor:null,headers:{'oai-authenticated-user-id':OWNER_A}});
  await assert.rejects(adminOverview(forged),e=>e.status===401);
});
test('operator endpoints fail closed and arbitrary first account cannot bind admin',async()=>{
  const {db}=setup();const p=await page();
  for(const fn of [adminOverview,adminAccounts,adminHubs,adminAudit])await assert.rejects(fn(await request('/api/operator')),e=>e.status===403);
  await assert.rejects(adminUpdateHub(await request('/api/operator/hubs/'+p.page.id,{method:'PATCH',body:{suspended:true,reason:'test moderation'}}),p.page.id),e=>e.status===403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_operators').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_operator_audit').get().n,0);
});
test('admin overview uses actual paid access, real events and correctly normalized THB estimate',async()=>{
  const {db}=setup(),a=await page(),b=await page('b'),owner=await bindOperator(db),other=await account('b');
  paid(db,owner.id);paid(db,other.id,{interval:'year'});const l=await link(a.page.id);await publish(a.page.id);
  event(db,a.page.id,'view');event(db,a.page.id,'click',l.id);event(db,a.page.id,'click',l.id);
  const overview=await adminOverview(await request('/api/operator?range=7d'));
  assert.equal(overview.totals.accounts,2);assert.equal(overview.totals.paidAccounts,2);assert.equal(overview.totals.pages,2);assert.equal(overview.totals.publishedPages,1);
  assert.equal(overview.totals.views,1);assert.equal(overview.totals.clicks,2);assert.equal(overview.totals.estimatedMrr,273.17);
  assert.equal(overview.daily.length,7);assert.equal(overview.topHubs[0].id,a.page.id);
  const list=await adminAccounts(await request('/api/operator/accounts?plan=pro'));
  assert.equal(list.total,2);assert.equal(list.items[0].subscription.paidUntil>Date.now(),true);
  assert.doesNotMatch(JSON.stringify(list),/line_user_id|stripe_customer_id|user_id|lock_token|TEST_MEDIA_SECRET/);
  paid(db,other.id,{status:'canceled',interval:'year'});
  assert.equal((await adminOverview(await request('/api/operator'))).totals.estimatedMrr,149);
  const free=await adminAccounts(await request('/api/operator/accounts?plan=starter'));assert.equal(free.total,1);assert.equal(free.items[0].id,other.id);
  assert.equal((await adminHubs(await request('/api/operator/hubs?q=owner-b'))).items[0].id,b.page.id);
});
test('hub suspension blocks public hub, media, views, redirects and republishing, then restores unchanged snapshot',async()=>{
  const {db}=setup(),p=await page(),asset=await upload(),l=await link(p.page.id,{icon:'image:'+asset.url.slice(7)});await publish(p.page.id);await bindOperator(db);
  const original=db.prepare('SELECT snapshot_json,revision,published FROM hub_pages WHERE id=?').get(p.page.id);
  const patch=(suspended,reason)=>request('/api/operator/hubs/'+p.page.id,{method:'PATCH',body:{suspended,reason}});
  await adminUpdateHub(await patch(true,'ตรวจสอบเนื้อหาจากรายงาน'),p.page.id);
  await assert.rejects(getPublicHub(await request('/h/owner-a',{actor:null}),'owner-a'),e=>e.status===404);
  await assert.rejects(serveAsset(await request(asset.url,{actor:null}),asset.url.slice(7)),e=>e.status===404);
  await assert.rejects(goToLink(await request('/go/owner-a/'+l.id,{actor:null}),'owner-a',l.id),e=>e.status===404);
  await assert.rejects(recordView(await request('/api/events',{actor:null,method:'POST',body:{type:'view',pageId:p.page.id,id:crypto.randomUUID()}})),e=>e.status===404);
  await assert.rejects(publish(p.page.id),e=>e.status===403&&e.extra.code==='hub_suspended');
  assert.equal((await serveAsset(await request(asset.url),asset.url.slice(7))).status,200,'owner can still access its own draft assets');
  assert.deepEqual(db.prepare('SELECT snapshot_json,revision,published FROM hub_pages WHERE id=?').get(p.page.id),original);
  const updated=await updatePage(await request('/api/pages/'+p.page.id,{method:'PATCH',body:{profile:{name:'แก้ไขฉบับร่างระหว่างพัก'}}}),p.page.id);
  assert.equal(updated.profile.name,'แก้ไขฉบับร่างระหว่างพัก');assert.equal(updated.page.suspended,true);assert.equal(updated.page.suspensionReason,'ตรวจสอบเนื้อหาจากรายงาน');
  assert.equal(db.prepare('SELECT snapshot_json FROM hub_pages WHERE id=?').get(p.page.id).snapshot_json,original.snapshot_json);
  await assert.rejects(publish(p.page.id),e=>e.status===403&&e.extra.code==='hub_suspended');
  await adminUpdateHub(await patch(false,'ตรวจสอบแล้ว เปิดใช้งานต่อ'),p.page.id);
  const restored=await getPublicHub(await request('/h/owner-a',{actor:null}),'owner-a');assert.equal(restored.links[0].id,l.id);assert.equal(restored.profile.name,'Hub a');
  assert.equal((await serveAsset(await request(asset.url,{actor:null}),asset.url.slice(7))).status,200);
  const audit=await adminAudit(await request('/api/operator/audit'));assert.equal(audit.total,2);assert.deepEqual(new Set(audit.items.map(x=>x.action)),new Set(['suspend_hub','restore_hub']));
});
test('admin support notes stay private and resolving upgrade request never grants Pro',async()=>{
  const {db}=setup();await bindOperator(db);const b=await account('b');
  db.prepare('INSERT INTO hub_upgrade_requests VALUES (?,?,NULL)').run(b.id,Date.now());
  await adminUpdateAccount(await request('/api/operator/accounts/'+b.id,{method:'PATCH',body:{supportNote:'รอติดต่อกลับวันจันทร์'}}),b.id);
  const list=await adminAccounts(await request('/api/operator/accounts?q=Owner B'));assert.equal(list.items[0].supportNote,'รอติดต่อกลับวันจันทร์');
  assert.doesNotMatch(JSON.stringify(await getWorkspace(await request('/api/workspace',{actor:'b'}))),/รอติดต่อกลับ/);
  await adminUpdateAccount(await request('/api/operator/accounts/'+b.id,{method:'PATCH',body:{resolveUpgradeRequest:true}}),b.id);
  assert.equal(db.prepare('SELECT plan FROM hub_accounts WHERE id=?').get(b.id).plan,'starter');
  assert.equal((await adminOverview(await request('/api/operator'))).totals.upgradeRequests,0);
  await assert.rejects(adminUpdateAccount(await request('/api/operator/accounts/'+b.id,{method:'PATCH',body:{plan:'pro'}}),b.id),e=>e.status===409);
  await assert.rejects(setAccountPlan(await request('/api/operator/accounts/'+b.id,{method:'PATCH',body:{plan:'pro'}}),b.id),e=>e.status===409);
});
test('admin writes reject cross-origin, invalid fields/reasons and rollback if audit cannot be stored',async()=>{
  const {db}=setup(),p=await page();await bindOperator(db);
  await assert.rejects(adminUpdateHub(await request('/api/operator/hubs/'+p.page.id,{method:'PATCH',body:{suspended:true,reason:'review'},headers:{Origin:'https://other.example'}}),p.page.id),e=>e.status===403);
  for(const body of [{suspended:true,reason:''},{suspended:true,reason:'review',plan:'pro'},{suspended:'true',reason:'review'}])await assert.rejects(adminUpdateHub(await request('/api/operator/hubs/'+p.page.id,{method:'PATCH',body}),p.page.id),e=>e.status===400);
  db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON hub_operator_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  await assert.rejects(adminUpdateHub(await request('/api/operator/hubs/'+p.page.id,{method:'PATCH',body:{suspended:true,reason:'moderation'}}),p.page.id),/audit unavailable/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hub_page_controls').get().n,0,'mutation and audit roll back together');
});


test('admin filters reject object-prototype names and invalid pagination',async()=>{
  const {db}=setup();await bindOperator(db);
  for(const status of ['constructor','__proto__','toString'])await assert.rejects(adminHubs(await request('/api/operator/hubs?status='+status)),e=>e.status===400);
  for(const page of ['0','-1','1.5','1000000'])await assert.rejects(adminAccounts(await request('/api/operator/accounts?page='+page)),e=>e.status===400);
});

