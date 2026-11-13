import {db, HubError, requireOperator, sameOrigin, type AccountRow} from './hub-data';
import {HUB_BILLING_PRICES} from './hub-billing-types';
import type {AdminAccount, AdminAudit, AdminHub, AdminList, AdminOverview, AdminRange, AdminSubscription} from './hub-admin-types';

const PAGE_SIZE = 25;
const DAY = 86_400_000;
const OFFSET = 7 * 3_600_000;
// This fragment always uses the account alias a. A mutable plan label is not payment evidence.
const PAID = `a.plan='pro' AND EXISTS(SELECT 1 FROM hub_billing_accounts b WHERE b.account_id=a.id AND b.managed=1)
  AND EXISTS(SELECT 1 FROM hub_billing_subscriptions s WHERE s.account_id=a.id AND s.livemode=1
    AND s.status IN ('active','past_due') AND s.paid_until>?)`;
function parameters(request: Request) {return new URL(request.url).searchParams;}
function listParameters(request: Request) {
  const params = parameters(request), q = (params.get('q') ?? '').trim();
  if (q.length > 100) throw new HubError(400, 'คำค้นยาวเกิน 100 ตัวอักษร');
  const value = params.get('page') ?? '1';
  if (!/^[1-9]\d{0,5}$/.test(value)) throw new HubError(400, 'หน้ารายการไม่ถูกต้อง');
  const page = Number(value), like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  return {params, q, like, page, offset: (page - 1) * PAGE_SIZE};
}
function period(request: Request, now: number): {range: AdminRange; start: number} {
  const value = parameters(request).get('range') ?? '7d';
  if (!['today','7d','30d','all'].includes(value)) throw new HubError(400, 'ช่วงเวลาไม่ถูกต้อง');
  const range = value as AdminRange;
  return {range, start: range === 'all' ? 0 : Math.floor((now + OFFSET) / DAY) * DAY - OFFSET - (range === '30d' ? 29 : range === '7d' ? 6 : 0) * DAY};
}
function asAudit(row: Record<string, unknown>): AdminAudit {
  return {id: String(row.id), actorName: String(row.actor_name), action: row.action as AdminAudit['action'],
    targetId: String(row.target_id), targetLabel: String(row.target_label), reason: String(row.reason), createdAt: Number(row.created_at)};
}
export async function adminOverview(request: Request): Promise<AdminOverview> {
  await requireOperator(request);
  const now = Date.now(), {range, start} = period(request, now), database = db();
  const [accounts, pages, events, dailyRows, topHubs, audits, subscriptions] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS accounts,SUM(CASE WHEN ${PAID} THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN a.created_at>=? AND a.created_at<=? THEN 1 ELSE 0 END) AS new_accounts,
      (SELECT COUNT(*) FROM hub_upgrade_requests WHERE resolved_at IS NULL) AS upgrade_requests FROM hub_accounts a`)
      .bind(now, start, now).first<{accounts: number; paid: number; new_accounts: number; upgrade_requests: number}>(),
    database.prepare(`SELECT COUNT(*) AS pages,
      SUM(CASE WHEN p.published=1 AND p.archived=0 AND COALESCE(c.suspended,0)=0 THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN c.suspended=1 THEN 1 ELSE 0 END) AS suspended
      FROM hub_pages p LEFT JOIN hub_page_controls c ON c.page_id=p.id`).first<{pages: number; published: number; suspended: number}>(),
    database.prepare("SELECT SUM(type='view') AS views,SUM(type='click') AS clicks FROM hub_events WHERE created_at>=? AND created_at<=?")
      .bind(start, now).first<{views: number; clicks: number}>(),
    database.prepare(`SELECT day AS date,SUM(views) AS views,SUM(clicks) AS clicks,SUM(new_accounts) AS newAccounts,SUM(new_pages) AS newPages FROM (
      SELECT date(created_at/1000,'unixepoch','+7 hours') AS day,SUM(type='view') AS views,SUM(type='click') AS clicks,0 AS new_accounts,0 AS new_pages FROM hub_events WHERE created_at>=? AND created_at<=? GROUP BY day
      UNION ALL SELECT date(created_at/1000,'unixepoch','+7 hours') AS day,0,0,COUNT(*),0 FROM hub_accounts WHERE created_at>=? AND created_at<=? GROUP BY day
      UNION ALL SELECT date(created_at/1000,'unixepoch','+7 hours') AS day,0,0,0,COUNT(*) FROM hub_pages WHERE created_at>=? AND created_at<=? GROUP BY day
    ) GROUP BY day ORDER BY day`).bind(start, now, start, now, start, now).all<AdminOverview['daily'][number]>(),
    database.prepare(`SELECT p.id,p.slug,COALESCE(json_extract(p.profile_json,'$.name'),p.slug) AS title,a.display_name AS accountName,
      SUM(CASE WHEN e.type='view' THEN 1 ELSE 0 END) AS views,SUM(CASE WHEN e.type='click' THEN 1 ELSE 0 END) AS clicks
      FROM hub_pages p JOIN hub_accounts a ON a.id=p.account_id JOIN hub_events e ON e.page_id=p.id
      WHERE e.created_at>=? AND e.created_at<=? GROUP BY p.id ORDER BY clicks DESC,views DESC,p.id LIMIT 10`)
      .bind(start, now).all<AdminOverview['topHubs'][number]>(),
    database.prepare('SELECT * FROM hub_operator_audit ORDER BY created_at DESC,id DESC LIMIT 5').all<Record<string, unknown>>(),
    // One current paid subscription per account; duplicates never inflate the estimate.
    database.prepare(`SELECT s.billing_interval AS interval,COUNT(*) AS n FROM hub_accounts a
      JOIN hub_billing_subscriptions s ON s.stripe_subscription_id=(SELECT x.stripe_subscription_id FROM hub_billing_subscriptions x
        WHERE x.account_id=a.id AND x.livemode=1 AND x.status IN ('active','past_due') AND x.paid_until>?
        ORDER BY x.paid_until DESC,x.updated_at DESC,x.stripe_subscription_id LIMIT 1)
      WHERE ${PAID} GROUP BY s.billing_interval`).bind(now, now).all<{interval: string; n: number}>(),
  ]);
  const monthly = subscriptions.results.find(row => row.interval === 'month')?.n ?? 0;
  const yearly = subscriptions.results.find(row => row.interval === 'year')?.n ?? 0;
  const daily = dailyRows.results, lookup = new Map(daily.map(row => [row.date, row]));
  const filled: AdminOverview['daily'] = [];
  if (range !== 'all') for (let stamp = start; stamp <= now; stamp += DAY) {
    const date = new Date(stamp + OFFSET).toISOString().slice(0,10);
    filled.push(lookup.get(date) ?? {date, views: 0, clicks: 0, newAccounts: 0, newPages: 0});
  }
  return {range, from: start, to: now, totals: {
    accounts: accounts?.accounts ?? 0, paidAccounts: accounts?.paid ?? 0,
    starterAccounts: (accounts?.accounts ?? 0) - (accounts?.paid ?? 0), pages: pages?.pages ?? 0,
    publishedPages: pages?.published ?? 0, suspendedPages: pages?.suspended ?? 0,
    views: events?.views ?? 0, clicks: events?.clicks ?? 0, newAccounts: accounts?.new_accounts ?? 0,
    upgradeRequests: accounts?.upgrade_requests ?? 0, monthlySubscriptions: monthly, yearlySubscriptions: yearly,
    estimatedMrr: Math.round((monthly * HUB_BILLING_PRICES.monthly + yearly * HUB_BILLING_PRICES.yearly / 12) * 100) / 100,
  }, daily: range === 'all' ? daily : filled, topHubs: topHubs.results, recentAudit: audits.results.map(asAudit)};
}

export async function adminAccounts(request: Request): Promise<AdminList<AdminAccount>> {
  await requireOperator(request);
  const {params, like, page, offset} = listParameters(request), now = Date.now(), plan = params.get('plan') ?? 'all';
  if (!['all','starter','pro'].includes(plan)) throw new HubError(400, 'แพ็กเกจที่เลือกไม่ถูกต้อง');
  const where = `WHERE (a.display_name LIKE ? ESCAPE '\\' OR a.email LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\')`
    + (plan === 'all' ? '' : plan === 'pro' ? ` AND (${PAID})` : ` AND NOT (${PAID})`);
  const values: (number|string)[] = [like, like, like, ...(plan === 'all' ? [] : [now])];
  const [count, rows] = await Promise.all([
    db().prepare(`SELECT COUNT(*) AS n FROM hub_accounts a ${where}`).bind(...values).first<{n: number}>(),
    db().prepare(`SELECT a.id,a.display_name,a.email,a.created_at,CASE WHEN ${PAID} THEN 1 ELSE 0 END AS paid,
      (SELECT COUNT(*) FROM hub_pages p WHERE p.account_id=a.id AND p.archived=0) AS page_count,
      (SELECT COUNT(*) FROM hub_pages p WHERE p.account_id=a.id AND p.archived=0 AND p.published=1
        AND NOT EXISTS(SELECT 1 FROM hub_page_controls c WHERE c.page_id=p.id AND c.suspended=1)) AS published_pages,
      (SELECT COUNT(*) FROM hub_events e JOIN hub_pages p ON p.id=e.page_id WHERE p.account_id=a.id AND e.type='view') AS total_views,
      (SELECT COUNT(*) FROM hub_events e JOIN hub_pages p ON p.id=e.page_id WHERE p.account_id=a.id AND e.type='click') AS total_clicks,
      EXISTS(SELECT 1 FROM hub_upgrade_requests u WHERE u.account_id=a.id AND u.resolved_at IS NULL) AS upgrade_requested,
      COALESCE(n.note,'') AS support_note,s.status,s.billing_interval,s.paid_until,s.cancel_at_period_end
      FROM hub_accounts a LEFT JOIN hub_account_support n ON n.account_id=a.id
      LEFT JOIN hub_billing_subscriptions s ON s.stripe_subscription_id=(SELECT x.stripe_subscription_id FROM hub_billing_subscriptions x
        WHERE x.account_id=a.id AND x.livemode=1 ORDER BY CASE WHEN x.status IN ('active','past_due') AND x.paid_until>? THEN 0 ELSE 1 END,
        x.updated_at DESC,x.stripe_subscription_id LIMIT 1)
      ${where} ORDER BY a.created_at DESC,a.id LIMIT ? OFFSET ?`).bind(now, now, ...values, PAGE_SIZE, offset).all<Record<string, unknown>>(),
  ]);
  return {page, pageSize: PAGE_SIZE, total: count?.n ?? 0, items: rows.results.map(row => ({
    id: String(row.id), displayName: String(row.display_name), email: String(row.email), plan: row.paid ? 'pro' : 'starter',
    analyticsAccess: !!row.paid, pageCount: Number(row.page_count), publishedPages: Number(row.published_pages),
    totalViews: Number(row.total_views), totalClicks: Number(row.total_clicks), createdAt: Number(row.created_at),
    upgradeRequested: !!row.upgrade_requested, supportNote: String(row.support_note),
    subscription: row.status ? {status: String(row.status), interval: row.billing_interval as 'month'|'year', paidUntil: Number(row.paid_until), cancelAtPeriodEnd: !!row.cancel_at_period_end} as AdminSubscription : null,
  }))};
}
export async function adminHubs(request: Request): Promise<AdminList<AdminHub>> {
  await requireOperator(request);
  const {params, like, page, offset} = listParameters(request), status = params.get('status') ?? 'all';
  const filter: Record<string, string> = {all: '', published: ' AND p.published=1 AND p.archived=0 AND COALESCE(c.suspended,0)=0',
    draft: ' AND p.published=0 AND p.archived=0 AND COALESCE(c.suspended,0)=0', archived: ' AND p.archived=1', suspended: ' AND c.suspended=1'};
  if (!Object.hasOwn(filter,status)) throw new HubError(400, 'สถานะฮับไม่ถูกต้อง');
  const from = `FROM hub_pages p JOIN hub_accounts a ON a.id=p.account_id LEFT JOIN hub_page_controls c ON c.page_id=p.id
    WHERE (p.slug LIKE ? ESCAPE '\\' OR json_extract(p.profile_json,'$.name') LIKE ? ESCAPE '\\' OR a.display_name LIKE ? ESCAPE '\\')${filter[status]}`;
  const [count, rows] = await Promise.all([
    db().prepare(`SELECT COUNT(*) AS n ${from}`).bind(like,like,like).first<{n:number}>(),
    db().prepare(`SELECT p.id,p.account_id,a.display_name,p.slug,COALESCE(json_extract(p.profile_json,'$.name'),p.slug) AS title,
      p.published,p.archived,COALESCE(c.suspended,0) AS suspended,c.reason,p.created_at,p.updated_at,
      (SELECT COUNT(*) FROM hub_events e WHERE e.page_id=p.id AND e.type='view') AS views,
      (SELECT COUNT(*) FROM hub_events e WHERE e.page_id=p.id AND e.type='click') AS clicks
      ${from} ORDER BY p.updated_at DESC,p.id LIMIT ? OFFSET ?`).bind(like,like,like,PAGE_SIZE,offset).all<Record<string,unknown>>(),
  ]);
  return {page,pageSize:PAGE_SIZE,total:count?.n??0,items:rows.results.map(row=>({
    id:String(row.id),accountId:String(row.account_id),accountName:String(row.display_name),slug:String(row.slug),title:String(row.title),
    published:!!row.published,archived:!!row.archived,suspended:!!row.suspended,suspensionReason:row.suspended?String(row.reason):null,
    totalViews:Number(row.views),totalClicks:Number(row.clicks),createdAt:Number(row.created_at),updatedAt:Number(row.updated_at),
  }))};
}
export async function adminAudit(request: Request): Promise<AdminList<AdminAudit>> {
  await requireOperator(request);
  const {page,offset}=listParameters(request);
  const [count,rows]=await Promise.all([
    db().prepare('SELECT COUNT(*) AS n FROM hub_operator_audit').first<{n:number}>(),
    db().prepare('SELECT * FROM hub_operator_audit ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').bind(PAGE_SIZE,offset).all<Record<string,unknown>>(),
  ]);
  return {page,pageSize:PAGE_SIZE,total:count?.n??0,items:rows.results.map(asAudit)};
}
async function input(request:Request):Promise<Record<string,unknown>>{
  if(!(request.headers.get('content-type')??'').toLowerCase().includes('application/json'))throw new HubError(415,'กรุณาส่งข้อมูลแบบ JSON');
  const reader=request.body?.getReader();if(!reader)throw new HubError(400,'ข้อมูลไม่ครบ');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw new HubError(413,'ข้อมูลยาวเกินไป');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let value:unknown;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HubError(400,'รูปแบบข้อมูลไม่ถูกต้อง');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HubError(400,'รูปแบบข้อมูลไม่ถูกต้อง');return value as Record<string,unknown>;
}
function cleanText(value:unknown,min:number,max:number):string{
  if(typeof value!=='string')throw new HubError(400,'กรุณากรอกข้อความ');const text=value.trim();
  if(text.length<min||text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw new HubError(400,`กรอกข้อความ ${min}–${max} ตัวอักษร`);return text;
}
function auditStatement(actor:AccountRow,action:AdminAudit['action'],targetId:string,label:string,reason:string,now:number){
  return db().prepare('INSERT INTO hub_operator_audit(id,actor_id,actor_name,action,target_id,target_label,reason,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor.id,actor.display_name,action,targetId,label,reason,now);
}
export async function adminUpdateAccount(request:Request,id:string):Promise<{ok:true}>{
  const actor=await requireOperator(request);sameOrigin(request);const data=await input(request);
  if('plan'in data)throw new HubError(409,'แพ็กเกจอัปเดตจากการชำระเงินผ่าน Stripe เท่านั้น',{code:'billing_managed_plan'});
  const fields=Object.keys(data);if(fields.length!==1||!['supportNote','resolveUpgradeRequest'].includes(fields[0]))throw new HubError(400,'เลือกแก้บันทึกหรือปิดคำขอทีละรายการ');
  const account=await db().prepare('SELECT id,display_name FROM hub_accounts WHERE id=?').bind(id).first<{id:string;display_name:string}>();
  if(!account)throw new HubError(404,'ไม่พบบัญชีนี้');const now=Date.now();
  if('supportNote'in data){const note=cleanText(data.supportNote,0,1000);await db().batch([
    db().prepare(`INSERT INTO hub_account_support(account_id,note,updated_by,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(id,note,actor.id,now),
    auditStatement(actor,'update_account_note',id,account.display_name,'อัปเดตบันทึกสำหรับทีมดูแล',now),
  ]);}else{
    if(data.resolveUpgradeRequest!==true)throw new HubError(400,'สถานะคำขอไม่ถูกต้อง');
    if(!await db().prepare('SELECT account_id FROM hub_upgrade_requests WHERE account_id=? AND resolved_at IS NULL').bind(id).first())throw new HubError(409,'ไม่มีคำขอที่รอดำเนินการ');
    await db().batch([
      db().prepare('UPDATE hub_upgrade_requests SET resolved_at=? WHERE account_id=? AND resolved_at IS NULL').bind(now,id),
      auditStatement(actor,'resolve_upgrade_request',id,account.display_name,'ปิดคำขอติดต่อเรื่องอัปเกรด ไม่เปลี่ยนแพ็กเกจ',now),
    ]);
  }return {ok:true};
}
export async function adminUpdateHub(request:Request,id:string):Promise<{ok:true}>{
  const actor=await requireOperator(request);sameOrigin(request);const data=await input(request);
  if(Object.keys(data).some(key=>!['suspended','reason'].includes(key))||typeof data.suspended!=='boolean')throw new HubError(400,'เลือกสถานะฮับและระบุเหตุผล');
  const reason=cleanText(data.reason,3,500);
  const hub=await db().prepare("SELECT p.id,p.slug,COALESCE(json_extract(p.profile_json,'$.name'),p.slug) AS title,COALESCE(c.suspended,0) AS suspended FROM hub_pages p LEFT JOIN hub_page_controls c ON c.page_id=p.id WHERE p.id=?").bind(id).first<{id:string;slug:string;title:string;suspended:number}>();
  if(!hub)throw new HubError(404,'ไม่พบฮับนี้');
  if(!!hub.suspended===data.suspended)return {ok:true};
  const now=Date.now();await db().batch([
    db().prepare(`INSERT INTO hub_page_controls(page_id,suspended,reason,updated_by,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(page_id) DO UPDATE SET suspended=excluded.suspended,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(id,+data.suspended,reason,actor.id,now),
    auditStatement(actor,data.suspended?'suspend_hub':'restore_hub',id,hub.title+' /h/'+hub.slug,reason,now),
  ]);return {ok:true};
}
