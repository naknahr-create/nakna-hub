import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='./hub-billing-entitlements')return {url:new URL('../lib/hub-billing-entitlements.ts',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
const {
  bangkokDay, reportWindow, parseSendTime, differenceLabel, digestConfigured,
  getLineSettings, updateLineSettings, buildDigestReport, sendLineTest: sendApprovedLineTest,
  runLineDigests: dispatchDigests, classifyLineResponse,
} = await import('../lib/line-digest.ts');
import {handleLineWebhook, verifyLineWebhook} from '../lib/line-webhook.ts';

// All database operations are real SQLite SQL. Every outbound LINE request is mocked.
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sql.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
  }
  const statement = (query, values = []) => ({
    query, values,
    bind(...args) {return statement(query, args);},
    async first(column) {const row=sql.prepare(query).get(...values);return row ? column ? row[column] : {...row} : null;},
    async all() {return {results:sql.prepare(query).all(...values).map(row=>({...row})),success:true};},
    async run() {return this.execute();},
    execute() {const result=sql.prepare(query).run(...values);return {success:true,meta:{changes:Number(result.changes)}};},
  });
  return {sql, prepare:statement, async batch(statements) {
    sql.exec('BEGIN');
    try {const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results;}
    catch(error){sql.exec('ROLLBACK');throw error;}
  }};
}
const DAY=86_400_000;
const NOW=Date.parse('2026-11-13T02:00:00Z'); // 09:00 Bangkok; reports Nov12.
const LINE_A='U'+'a'.repeat(32), LINE_B='U'+'b'.repeat(32);
function runLineDigests(env,now,fetcher) {return dispatchDigests(env,now,fetcher,()=>now);}
function sendLineTest(env,account,now,fetcher) {return sendApprovedLineTest(env,account,reportWindow(now).date,now,fetcher);}
function setup({enabled=true}={}) {
  const DB=database();
  const env={DB,APP_ORIGIN:'https://hub.example.com',LINE_LOGIN_CHANNEL_ID:'12345',LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:'TEST_TOKEN_NOT_REAL',LINE_MESSAGING_CHANNEL_SECRET:'TEST_SECRET_NOT_REAL',LINE_OFFICIAL_ACCOUNT_URL:'https://line.me/R/ti/p/@naknahub',LINE_DIGEST_ENABLED:enabled?'true':'false'};
  for(const [id,line] of [['a',LINE_A],['b',LINE_B]]) {
    const uid=`line:12345:${line}`;
    DB.sql.prepare("INSERT INTO hub_accounts VALUES (?,?,?,'','pro',?,?)").run(id,uid,id==='a'?'นอต':'คนอื่น',NOW-DAY,NOW-DAY);
    DB.sql.prepare('INSERT INTO hub_line_connections VALUES (?,?,?,?,?,?,?)').run(uid,line,'12345','following',NOW-DAY,NOW-DAY,NOW-DAY);
    DB.sql.prepare('INSERT INTO hub_billing_accounts(account_id,managed,updated_at) VALUES (?,1,?)').run(id,NOW-DAY);
    DB.sql.prepare("INSERT INTO hub_billing_subscriptions(stripe_subscription_id,account_id,stripe_customer_id,stripe_price_id,billing_interval,status,current_period_end,paid_until,cancel_at_period_end,livemode,updated_at) VALUES (?,?,?,?,'month','active',?,?,0,1,?)")
      .run('sub_'+id,id,'cus_'+id,'price_month',NOW+30*DAY,NOW+30*DAY,NOW-DAY);

    DB.sql.prepare('INSERT INTO hub_pages(id,account_id,slug,profile_json,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('page-'+id,id,'hub-'+id,JSON.stringify({name:'HUB '+id}),NOW-DAY,NOW-DAY);
    DB.sql.prepare('INSERT INTO hub_links(id,page_id,title,created_at) VALUES (?,?,?,?)').run('link-'+id,'page-'+id,id==='a'?'หน้าร้านของฉัน':'ข้อมูลลับของบัญชี B',NOW-DAY);
  }
  return env;
}
function event(env,account,type,time=NOW-12*3_600_000) {
  env.DB.sql.prepare('INSERT INTO hub_events VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(),'page-'+account,type,type==='click'?'link-'+account:null,time,'mobile','direct');
}
async function enable(env,account='a',now=NOW-DAY) {await updateLineSettings(env,account,{enabled:true,time:'09:00'},now);}
async function sign(body,secret) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('base64');
}
async function webhook(env,events,now=NOW) {
  const body=JSON.stringify({events});
  return handleLineWebhook(new Request('https://hub.example.com/api/line/webhook',{method:'POST',body,headers:{'x-line-signature':await sign(body,env.LINE_MESSAGING_CHANNEL_SECRET)}}),env,now);
}
function followEvent(type,timestamp=NOW,id=crypto.randomUUID(),line=LINE_A) {return {type,timestamp,webhookEventId:id,source:{type:'user',userId:line}};}

test('free LINE accounts cannot preview, test-send or opt in, but can opt out of their saved preference',async()=>{
  const env=setup();await enable(env);event(env,'a','click');
  env.DB.sql.prepare("UPDATE hub_accounts SET plan='starter' WHERE id='a'").run();
  const settings=await getLineSettings(env,'a',NOW);
  assert.equal(settings.entitlement,false);assert.equal(settings.subscribed,true);assert.equal(settings.enabled,false);
  const denied=e=>e.status===403&&e.code==='analytics_pro_required';
  await assert.rejects(buildDigestReport(env,'a',NOW),denied);
  await assert.rejects(updateLineSettings(env,'a',{enabled:true,time:'09:00'},NOW),denied);
  let requests=0;await assert.rejects(sendLineTest(env,'a',NOW,async()=>{requests++;return new Response('{}');}),denied);
  assert.equal(requests,0);
  const result=await runLineDigests(env,NOW,async()=>{requests++;return new Response('{}');});
  assert.equal(result.queued,0);assert.equal(requests,0);
  const off=await updateLineSettings(env,'a',{enabled:false,time:'09:00'},NOW);assert.equal(off.subscribed,false);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) AS n FROM hub_events WHERE type='click'").get().n,1,'paywall preserves collected history');
});
test('expired paid access cancels a previously queued report before outbound delivery',async()=>{
  const env=setup();await enable(env);event(env,'a','view');
  const first=await runLineDigests(env,NOW,async()=>new Response('{}',{status:500}));assert.equal(first.retry,1);
  env.DB.sql.prepare("UPDATE hub_billing_subscriptions SET paid_until=? WHERE account_id='a'").run(NOW+1);
  let requests=0;await runLineDigests(env,NOW+15*60000,async()=>{requests++;return new Response('{}');});
  assert.equal(requests,0);assert.equal(env.DB.sql.prepare("SELECT status FROM hub_line_deliveries WHERE account_id='a'").get().status,'cancelled');
  assert.equal((await getLineSettings(env,'a',NOW+15*60000)).entitlement,false);
});
test('scheduled reports exclude live-unpaid, test-mode and canceled subscription records',async()=>{
  for(const patch of ["livemode=0","status='canceled'","paid_until=0"]){
    const env=setup();await enable(env);env.DB.sql.exec("UPDATE hub_billing_subscriptions SET "+patch+" WHERE account_id='a'");
    let requests=0;const result=await runLineDigests(env,NOW,async()=>{requests++;return new Response('{}');});
    assert.equal(result.queued,0);assert.equal(requests,0);
  }
});
test('delayed Cron checks paid access at actual dispatch time rather than stale scheduled time',async()=>{
  const env=setup();await enable(env);
  env.DB.sql.prepare("UPDATE hub_billing_subscriptions SET paid_until=? WHERE account_id='a'").run(NOW+60000);
  let requests=0;
  const result=await dispatchDigests(env,NOW,async()=>{requests++;return new Response('{}');},()=>NOW+2*DAY);
  assert.equal(result.queued,0);assert.equal(requests,0);
});

test('complete report day follows Bangkok midnight, including year changes',()=>{
  assert.equal(bangkokDay(Date.parse('2026-12-31T17:00:00Z')).date,'2027-01-01');
  const window=reportWindow(Date.parse('2026-12-31T17:00:00Z'));
  assert.equal(window.date,'2026-12-31');
  assert.equal(new Date(window.start).toISOString(),'2026-12-30T17:00:00.000Z');
  assert.equal(window.end-window.start,DAY);
});
test('schedule accepts only 15-minute slots and delta never divides by zero',()=>{
  assert.deepEqual(parseSendTime('23:45'),{hour:23,minute:45});
  for(const time of ['24:00','09:01','9:00','23:60',null]) assert.throws(()=>parseSendTime(time));
  assert.match(differenceLabel(4,0),/วันก่อน 0/);
  assert.equal(differenceLabel(0,0),'เท่าเดิม');
  assert.match(differenceLabel(5,10),/-50.0%/);
});
test('settings default OFF; previews still work while outbound dispatch is disabled',async()=>{
  const env=setup({enabled:false});
  const settings=await getLineSettings(env,'a',NOW);
  assert.equal(settings.enabled,false); assert.equal(settings.configured,false); assert.equal(settings.time,'09:00');
  assert.equal(settings.connected,true); assert.equal(settings.friendStatus,'friend');
  const report=await buildDigestReport(env,'a',NOW);
  assert.equal(report.totals.clicks,0); assert.match(report.text,/ไม่ใช่จำนวนคนไม่ซ้ำ/);
  let calls=0;const result=await runLineDigests(env,NOW,async()=>{calls++;throw Error('must not send');});
  assert.equal(result.disabled,true);assert.equal(calls,0);
});
test('reports isolate accounts and completed days; archive retains historical events',async()=>{
  const env=setup();
  event(env,'a','click');event(env,'a','click');event(env,'a','view');
  event(env,'a','click',NOW-DAY-12*3_600_000);
  event(env,'a','click',NOW-60_000); // current day: exclude.
  for(let i=0;i<8;i++)event(env,'b','click');
  env.DB.sql.prepare('UPDATE hub_pages SET archived=1 WHERE account_id=?').run('a');
  const report=await buildDigestReport(env,'a',NOW);
  assert.deepEqual(report.totals,{views:1,clicks:2});assert.equal(report.previous.clicks,1);
  assert.equal(report.topLinks[0].clicks,2);assert.equal(report.reportDate,'2026-11-12');
  assert.match(report.text,/\+100.0%/);assert.doesNotMatch(report.text,/ข้อมูลลับ/);assert.equal(report.busiestHour,21);
});
test('settings reject missing provider readiness, arbitrary recipients, invalid slots, and foreign channel connections',async()=>{
  const env=setup({enabled:false});
  await assert.rejects(updateLineSettings(env,'a',{enabled:true,time:'09:00'},NOW),e=>e.code==='line_not_configured');
  env.LINE_DIGEST_ENABLED='true';
  await assert.rejects(updateLineSettings(env,'a',{enabled:true,time:'09:00',to:LINE_B},NOW),e=>e.status===400);
  await assert.rejects(updateLineSettings(env,'a',{enabled:true,time:'09:10'},NOW),e=>e.code==='invalid_time');
  env.LINE_LOGIN_CHANNEL_ID='other';
  assert.equal(digestConfigured(env),false);
  assert.equal((await getLineSettings(env,'a',NOW)).connected,false);
});
test('test send is one explicitly requested account-specific message and is rate limited',async()=>{
  const env=setup();event(env,'a','click');event(env,'b','click');
  const calls=[];const mock=async(url,options)=>{calls.push({url,...options});return new Response('{}',{status:200});};
  const result=await sendLineTest(env,'a',NOW,mock);
  assert.equal(result.accepted,true);assert.equal(calls.length,1);
  assert.equal(calls[0].redirect,'manual');
  const body=JSON.parse(calls[0].body);assert.equal(body.to,LINE_A);assert.match(body.messages[0].text,/ข้อความทดสอบ/);
  assert.match(calls[0].headers['X-Line-Retry-Key'],/^[a-f0-9-]{36}$/);
  await assert.rejects(sendLineTest(env,'a',NOW+59_000,mock),e=>e.status===429);
  assert.equal(calls.length,1);
});
test('concurrent test clicks cannot bypass one-minute rate limit',async()=>{
  const env=setup();let calls=0;const mock=async()=>{calls++;return new Response('{}');};
  const results=await Promise.allSettled([sendLineTest(env,'a',NOW,mock),sendLineTest(env,'a',NOW,mock)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);
});
test('stale or missing preview date cannot send or consume the test cooldown',async()=>{
  const env=setup();await getLineSettings(env,'a',NOW);let calls=0;
  const mock=async()=>{calls++;return new Response('{}');};
  for(const date of ['2026-11-11',undefined,'2026-11-99']) {
    await assert.rejects(sendApprovedLineTest(env,'a',date,NOW,mock),e=>e.status===409&&e.code==='preview_expired');
  }
  assert.equal(calls,0);assert.equal(env.DB.sql.prepare('SELECT last_test_at FROM hub_line_preferences WHERE account_id=?').get('a').last_test_at,null);
  assert.equal((await sendLineTest(env,'a',NOW,mock)).accepted,true);assert.equal(calls,1);
});
test('concurrent cron ticks atomically create and lease only one daily message',async()=>{
  const env=setup();await enable(env);event(env,'a','click');let calls=0;
  const mock=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return new Response('{}');};
  await Promise.all([runLineDigests(env,NOW,mock),runLineDigests(env,NOW,mock)]);
  await runLineDigests(env,NOW+15*60_000,mock);
  assert.equal(calls,1);assert.equal(env.DB.sql.prepare("SELECT COUNT(*) AS n FROM hub_line_deliveries WHERE kind='daily'").get().n,1);
});
test('enabling or rescheduling after a slot starts from the next scheduled day',async()=>{
  const env=setup();await enable(env,'a',NOW+60_000);let calls=0;
  const mock=async()=>{calls++;return new Response('{}');};
  await runLineDigests(env,NOW+15*60_000,mock);assert.equal(calls,0);
  await runLineDigests(env,NOW+DAY,mock);assert.equal(calls,1);
});
test('retries preserve original payload and key; accepted409 stops further delivery',async()=>{
  const env=setup();await enable(env);event(env,'a','click');const calls=[];
  const mock=async(_url,options)=>{calls.push(options);return calls.length===1?new Response('{}',{status:500}):new Response('{}',{status:409,headers:{'x-line-accepted-request-id':'already-accepted'}});};
  assert.equal((await runLineDigests(env,NOW,mock)).retry,1);
  event(env,'a','click');
  assert.equal((await runLineDigests(env,NOW+15*60_000,mock)).accepted,1);
  await runLineDigests(env,NOW+60*60_000,mock);
  assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);
  assert.equal(calls[0].headers['X-Line-Retry-Key'],calls[1].headers['X-Line-Retry-Key']);
});
test('parallel cron does not invalidate the final attempt while its lease is active',async()=>{
  const env=setup();await enable(env);
  await runLineDigests(env,NOW,async()=>new Response('{}',{status:500}));
  env.DB.sql.prepare('UPDATE hub_line_deliveries SET attempts=5').run();
  let release,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const first=runLineDigests(env,NOW+15*60_000,async()=>{started();return held;});
  await ready;
  await runLineDigests(env,NOW+15*60_000,async()=>{throw new Error('active lease must prevent another push');});
  assert.equal(env.DB.sql.prepare('SELECT status FROM hub_line_deliveries').get().status,'sending');
  release(new Response('{}',{status:200}));
  assert.equal((await first).accepted,1);
  assert.equal(env.DB.sql.prepare('SELECT status FROM hub_line_deliveries').get().status,'accepted');
});
test('terminal errors, rate limits and quota errors have distinct bounded behavior',()=>{
  assert.equal(classifyLineResponse(409,'{}',null).outcome,'failed');
  assert.equal(classifyLineResponse(400,'{}',null).outcome,'failed');
  assert.equal(classifyLineResponse(429,'rate limit',null).outcome,'retry');
  assert.deepEqual(classifyLineResponse(429,'You have reached your monthly limit.',null),{outcome:'failed',code:'quota_exceeded'});
});
test('LINE push redirects are terminal and never follow the destination',async()=>{
  const env=setup();await enable(env);const calls=[];
  const mock=async(url,options)=>{
    calls.push({url,...options});
    return new Response(null,{status:307,headers:{Location:'https://other.example/push'}});
  };
  assert.equal((await runLineDigests(env,NOW,mock)).failed,1);
  await runLineDigests(env,NOW+15*60_000,mock);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.line.me/v2/bot/message/push');
  assert.equal(calls[0].redirect,'manual');
  assert.equal(env.DB.sql.prepare('SELECT last_error FROM hub_line_deliveries').get().last_error,'line_http_307');
});
test('monthly quota errors are terminal instead of repeatedly consuming API requests',async()=>{
  const env=setup();await enable(env);let calls=0;
  const mock=async()=>{calls++;return new Response('You have reached your monthly limit.',{status:429});};
  assert.equal((await runLineDigests(env,NOW,mock)).failed,1);
  await runLineDigests(env,NOW+60*60_000,mock);assert.equal(calls,1);
});
test('opt-out cancels queued retry and preserves the daily deduplication record',async()=>{
  const env=setup();await enable(env);let calls=0;
  const mock=async()=>{calls++;return new Response('{}',{status:500});};
  await runLineDigests(env,NOW,mock);
  await updateLineSettings(env,'a',{enabled:false,time:'09:00'},NOW+60_000);
  await runLineDigests(env,NOW+15*60_000,mock);
  assert.equal(calls,1);assert.equal(env.DB.sql.prepare('SELECT status FROM hub_line_deliveries').get().status,'cancelled');
});
test('retry keys never outlive the safety window',async()=>{
  const env=setup();await enable(env);let calls=0;
  const mock=async()=>{calls++;return new Response('{}',{status:500});};
  await runLineDigests(env,NOW,mock);
  env.DB.sql.prepare('UPDATE hub_line_deliveries SET first_attempt_at=?,created_at=?,next_attempt_at=?').run(NOW-24*3_600_000,NOW-24*3_600_000,NOW);
  await runLineDigests(env,NOW+15*60_000,mock);assert.equal(calls,1);
  assert.equal(env.DB.sql.prepare('SELECT last_error FROM hub_line_deliveries').get().last_error,'retry_window_expired');
});
test('pending jobs left unsent beyond the safety window expire without a first push',async()=>{
  const env=setup();await enable(env);let calls=0;
  const mock=async()=>{calls++;return new Response('{}',{status:500});};
  await runLineDigests(env,NOW,mock);
  env.DB.sql.prepare("UPDATE hub_line_deliveries SET status='pending',first_attempt_at=NULL,attempts=0,created_at=?,next_attempt_at=?").run(NOW-24*3_600_000,NOW);
  await runLineDigests(env,NOW+15*60_000,mock);
  assert.equal(calls,1);assert.equal(env.DB.sql.prepare('SELECT status FROM hub_line_deliveries').get().status,'failed');
});
test('webhook verifies raw bytes before parsing and rejects missing/tampered signatures',async()=>{
  const env=setup(),body=JSON.stringify({events:[followEvent('unfollow')]});
  const signature=await sign(body,env.LINE_MESSAGING_CHANNEL_SECRET);
  assert.equal(await verifyLineWebhook(new TextEncoder().encode(body),signature,env.LINE_MESSAGING_CHANNEL_SECRET),true);
  assert.equal(await verifyLineWebhook(new TextEncoder().encode(body+' '),signature,env.LINE_MESSAGING_CHANNEL_SECRET),false);
  const wrongSignature=(signature[0]==='A'?'B':'A')+signature.slice(1);
  const bad=await handleLineWebhook(new Request('https://hub.example.com/api/line/webhook',{method:'POST',body,headers:{'x-line-signature':wrongSignature}}),env,NOW);
  assert.equal(bad.status,401);assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_webhook_receipts').get().n,0);
  const missing=await handleLineWebhook(new Request('https://hub.example.com/api/line/webhook',{method:'POST',body}),env,NOW);
  assert.equal(missing.status,401);
  assert.equal((await webhook(env,[],NOW)).status,200);
});
test('unfollow cancels retries, duplicate events are harmless and old follow cannot unblock',async()=>{
  const env=setup();await enable(env);let calls=0;
  const mock=async()=>{calls++;return new Response('{}',{status:500});};
  await runLineDigests(env,NOW,mock);
  const unfollow=followEvent('unfollow',NOW+1000,'event-1');
  assert.equal((await webhook(env,[unfollow],NOW+2000)).status,200);
  assert.equal((await webhook(env,[unfollow,followEvent('follow',NOW,'older-follow')],NOW+3000)).status,200);
  assert.equal((await getLineSettings(env,'a',NOW+3000)).friendStatus,'blocked');
  assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_webhook_receipts').get().n,2);
  await runLineDigests(env,NOW+15*60_000,mock);assert.equal(calls,1);
  await assert.rejects(sendLineTest(env,'a',NOW+60_000,mock),e=>e.code==='line_not_friend');
});
test('follow before login creates only verified connection state, never an account or opt-in',async()=>{
  const env=setup(),line='U'+'c'.repeat(32);
  await webhook(env,[followEvent('follow',NOW,'new-user-follow',line)]);
  assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM hub_accounts').get().n,2);
  assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM hub_line_preferences').get().n,0);
  assert.equal(env.DB.sql.prepare('SELECT friend_status FROM hub_line_connections WHERE line_user_id=?').get(line).friend_status,'following');
});
