import {resolveHubPageAccess,teamWriteGuard,recordTeamPageActivity,isHubEditorIdentity} from './hub-teams';
import type {PageAccess} from './hub-team-types';
import {getAuthConfiguration} from './hub-auth';
import {imageAssetId} from './hub-link-media';
import {HUB_GALLERY_LIMIT,hasBlockAction,isHubContentType,isRichContentType,readBlockContent} from './hub-content';
import {applyHubTheme,getHubTheme} from './hub-themes';
import {expireBillingEntitlement, hasAnalyticsEntitlement} from './hub-billing-entitlements';
import {env} from 'cloudflare:workers';
import type {AnalyticsData,AnalyticsRange,HubAccount,HubBlockContent,HubLink,HubPlan,HubProfile,HubTemplate,OperatorData,PageEditorData,PageSummary,PlanLimits,PublicHubData,WorkspaceData} from './hub-types';

export class HubError extends Error {
  constructor(public status:number,message:string,public extra:Record<string,unknown>={}) {super(message);}
}
type Identity={userId:string;email:string;displayName:string};
export type AccountRow={id:string;user_id:string;display_name:string;email:string;plan:HubPlan;created_at:number;updated_at:number};
type PageRow={id:string;account_id:string;slug:string;profile_json:string;revision:number;published_revision:number;snapshot_json:string|null;published:number;archived:number;created_at:number;updated_at:number;published_at:number|null};
type LinkRow={id:string;page_id:string;type:HubLink['type'];title:string;description:string;url:string;icon:string;content_json?:string;enabled:number;featured:number;sort_order:number;archived:number;created_at:number};
type Snapshot={profile:HubProfile;links:HubLink[];revision:number};
type AssetRow={id:string;account_id:string;page_id:string|null;storage_key:string;mime_type:string;size:number;created_at:number};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVED=new Set(['admin','administrator','api','app','assets','auth','billing','blog','callback','cdn','contact','dashboard','demo','docs','edit','editor','go','help','home','hub','hubs','legal','login','logout','media','nakna','nakna-hub','operator','pricing','privacy','profile','register','settings','signin','signout','signin-with-chatgpt','signout-with-chatgpt','signup','studio','support','terms','uploads','www']);

export function db():D1Database {if(!env.DB)throw new HubError(503,'ฐานข้อมูลยังไม่พร้อม กรุณาลองใหม่');return env.DB;}
export function json(data:unknown,status=200):Response {return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export async function api(handler:()=>Promise<Response>):Promise<Response>{
  try{return await handler();}catch(error){
    if(error instanceof HubError)return json({error:error.message,...error.extra},error.status);
    const message=error instanceof Error?error.message:'Unknown error';
    console.error('HUB request failed',message);
    if(/UNIQUE constraint failed: hub_pages.slug/i.test(message))return json({error:'ชื่อลิงก์นี้ถูกใช้แล้ว ลองเลือกชื่ออื่น'},409);
    return json({error:'ยังทำรายการไม่ได้ กรุณาลองใหม่อีกครั้ง'},500);
  }
}
function identity(request:Request):Identity|null{
  const userId=request.headers.get('oai-authenticated-user-id')?.trim();
  const email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase()??'';
  if(!userId)return null;
  let name=request.headers.get('oai-authenticated-user-full-name')?.trim()??'';
  if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8')try{name=decodeURIComponent(name);}catch{name='';}
  return {userId,email,displayName:(name||email.split('@')[0]||'ผู้ใช้งาน').slice(0,120)};
}
export function sameOrigin(request:Request):void{
  if(request.headers.get('origin')!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site')throw new HubError(403,'คำขอไม่ถูกต้อง กรุณารีเฟรชหน้าแล้วลองใหม่');
}
async function boundedBody(request:Request,max:number):Promise<Uint8Array>{
  if(Number(request.headers.get('content-length')??0)>max)throw new HubError(413,'ข้อมูลมีขนาดใหญ่เกินไป');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw new HubError(413,'ข้อมูลมีขนาดใหญ่เกินไป');}chunks.push(value);}
  const data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}return data;
}
export async function body(request:Request,optional=false):Promise<Record<string,unknown>>{
  const bytes=await boundedBody(request,24000);if(optional&&!bytes.length)return {};
  if(!(request.headers.get('content-type')??'').toLowerCase().includes('application/json'))throw new HubError(415,'กรุณาส่งข้อมูลในรูปแบบ JSON');
  let value:unknown;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HubError(400,'รูปแบบข้อมูลไม่ถูกต้อง');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HubError(400,'รูปแบบข้อมูลไม่ถูกต้อง');return value as Record<string,unknown>;
}
export function keys(data:Record<string,unknown>,allowed:readonly string[]):void{if(Object.keys(data).some(key=>!allowed.includes(key)))throw new HubError(400,'มีช่องข้อมูลที่ไม่รองรับ');}
export function text(value:unknown,label:string,max:number,required=false):string{
  if(typeof value!=='string')throw new HubError(400,`${label}ต้องเป็นข้อความ`);const clean=value.trim();
  if((required&&!clean)||clean.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean))throw new HubError(400,`${label}ไม่ถูกต้อง (ไม่เกิน ${max} ตัวอักษร)`);return clean;
}
export function planLimits(plan:HubPlan):PlanLimits{return plan==='pro'?{maxPages:10,maxLinksPerPage:100}:{maxPages:1,maxLinksPerPage:5};}
async function operatorFor(user:Identity,bind=false):Promise<boolean>{
  const existing=await db().prepare('SELECT user_id FROM hub_operators WHERE slot=?').bind('operator').first<{user_id:string}>();
  if(existing)return existing.user_id===user.userId;
  const lineOperator=!!env.ADMIN_LINE_USER_ID&&/^U[0-9a-f]{32}$/.test(env.ADMIN_LINE_USER_ID)&&user.userId===`line:${env.LINE_LOGIN_CHANNEL_ID}:${env.ADMIN_LINE_USER_ID}`;
  const accessOperator=user.userId.startsWith('cf-access:')&&!!user.email&&!!env.ADMIN_EMAIL&&env.ADMIN_EMAIL.trim().toLowerCase()===user.email;
  if(!lineOperator&&!accessOperator)return false;
  if(!bind)return true;
  await db().prepare('INSERT OR IGNORE INTO hub_operators (slot,user_id,created_at) VALUES (?,?,?)').bind('operator',user.userId,Date.now()).run();
  const bound=await db().prepare('SELECT user_id FROM hub_operators WHERE slot=?').bind('operator').first<{user_id:string}>();return bound?.user_id===user.userId;
}
export async function requireAccount(request:Request):Promise<AccountRow>{
  const auth=getAuthConfiguration(env);
  if(!auth.configured)throw new HubError(503,auth.message??'สตูดิโอยังไม่พร้อมใช้งาน ผู้ดูแลต้องตั้งค่าระบบเข้าสู่ระบบก่อน',{code:'auth_not_configured'});
  const user=identity(request);if(!user)throw new HubError(401,'เข้าสู่ระบบเพื่อจัดการ HUB ของคุณ',{signInUrl:auth.signInUrl,provider:auth.provider});
  let account=await db().prepare('SELECT * FROM hub_accounts WHERE user_id=?').bind(user.userId).first<AccountRow>();
  if(!account){const now=Date.now();await db().prepare('INSERT OR IGNORE INTO hub_accounts (id,user_id,display_name,email,plan,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user.userId,user.displayName,user.email,'starter',now,now).run();account=await db().prepare('SELECT * FROM hub_accounts WHERE user_id=?').bind(user.userId).first<AccountRow>();}
  if(!account)throw new HubError(503,'ยังสร้างบัญชีไม่ได้ กรุณาลองใหม่');
  if(account.plan==='pro'&&await expireBillingEntitlement(db(),account.id))account={...account,plan:'starter'};
  if(account.email!==user.email||account.display_name!==user.displayName){await db().prepare('UPDATE hub_accounts SET email=?,display_name=?,updated_at=? WHERE id=?').bind(user.email,user.displayName,Date.now(),account.id).run();account={...account,email:user.email,display_name:user.displayName};}
  return account;
}
async function accountDTO(request:Request,account:AccountRow):Promise<HubAccount>{const analytics=await hasAnalyticsEntitlement(db(),account.id);return {id:account.id,displayName:account.display_name,email:account.email,plan:account.plan,entitlements:{analytics,lineDigest:analytics}};}
export async function requireAnalytics(account:AccountRow):Promise<void>{if(!await hasAnalyticsEntitlement(db(),account.id))throw new HubError(403,'สมัคร Pro เพื่อดูสถิติและรับสรุปผ่าน LINE',{code:'analytics_pro_required',upgradeUrl:'/studio?section=billing'});}
async function ownPage(account:AccountRow,id:string,includeArchived=false):Promise<PageRow>{
  const page=await db().prepare('SELECT * FROM hub_pages WHERE id=? AND account_id=?'+(includeArchived?'':' AND archived=0')).bind(id,account.id).first<PageRow>();
  if(!page)throw new HubError(404,'ไม่พบหน้านี้ หรือคุณไม่มีสิทธิ์เข้าถึง');return page;
}
type PageContext={page:PageRow;owner:AccountRow;access:PageAccess};
async function pageContext(actor:AccountRow,id:string,permission:'view'|'edit'|'publish'|'manage'='view',includeArchived=false):Promise<PageContext>{
  const page=await db().prepare('SELECT * FROM hub_pages WHERE id=?'+(includeArchived?'':' AND archived=0')).bind(id).first<PageRow>();
  if(!page||page.archived&&page.account_id!==actor.id)throw new HubError(404,'ไม่พบฮับนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');
  const result=await resolveHubPageAccess(actor,id,page.account_id);
  if(permission==='edit'&&!result.access.canEdit||permission==='publish'&&!result.access.canPublish||permission==='manage'&&!result.access.canManage)throw new HubError(403,'คุณไม่มีสิทธิ์ทำรายการนี้ในฮับที่ร่วมงาน');
  return {page,...result};
}
function clientRevision(value:unknown,page:PageRow):void{
  if(!Number.isSafeInteger(value)||Number(value)<1)throw new HubError(409,'โหลดข้อมูลล่าสุดก่อนบันทึก เพื่อไม่ให้ทับงานของผู้ร่วมงาน',{code:'revision_required'});
  if(value!==page.revision)throw new HubError(409,'มีผู้แก้ไขฮับนี้แล้ว งานที่คุณกำลังพิมพ์ยังอยู่ กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก',{code:'revision_conflict'});
}
// Both predicates reference the selected page `p` and a one-row `media` CTE.
// Exact JSON paths keep uploaded files private until an enabled published block
// (or published profile/cover) actually references them.
const DRAFT_MEDIA_REFERENCE=`(
  json_extract(p.profile_json,'$.avatarUrl')=media.url
  OR json_extract(p.profile_json,'$.shareImageUrl')=media.url
  OR EXISTS(SELECT 1 FROM hub_links l WHERE l.page_id=p.id AND (
    l.icon=media.icon OR json_extract(l.content_json,'$.imageUrl')=media.url
    OR EXISTS(SELECT 1 FROM json_each(l.content_json,'$.images') image WHERE json_extract(image.value,'$.url')=media.url)
  ))
)`;
const PUBLISHED_MEDIA_REFERENCE=`(
  json_extract(p.snapshot_json,'$.profile.avatarUrl')=media.url
  OR json_extract(p.snapshot_json,'$.profile.shareImageUrl')=media.url
  OR EXISTS(SELECT 1 FROM json_each(p.snapshot_json,'$.links') l
    WHERE json_extract(l.value,'$.enabled')=1 AND COALESCE(json_extract(l.value,'$.archived'),0)=0 AND (
      (json_extract(l.value,'$.type')='link' AND json_extract(l.value,'$.icon')=media.icon)
      OR (json_extract(l.value,'$.type') IN ('image','service') AND json_extract(l.value,'$.content.imageUrl')=media.url)
      OR (json_extract(l.value,'$.type')='gallery' AND EXISTS(
        SELECT 1 FROM json_each(l.value,'$.content.images') image WHERE json_extract(image.value,'$.url')=media.url
      ))
    )
  )
)`;
async function assetUsable(assetId:string,ownerId:string,pageId?:string,actorId?:string):Promise<boolean>{
  if(!actorId||actorId===ownerId)return !!await db().prepare('SELECT id FROM hub_assets WHERE id=? AND account_id=?').bind(assetId,ownerId).first();
  if(!pageId)return false;
  return !!await db().prepare(`WITH media AS (SELECT ? AS url,? AS icon)
    SELECT a.id FROM hub_assets a CROSS JOIN media WHERE a.id=? AND a.account_id=? AND (
      a.page_id=? OR EXISTS(SELECT 1 FROM hub_pages p WHERE p.id=? AND p.account_id=a.account_id
        AND (${DRAFT_MEDIA_REFERENCE} OR ${PUBLISHED_MEDIA_REFERENCE}))
    )`).bind('/media/'+assetId,'image:'+assetId,assetId,ownerId,pageId,pageId).first();
}
function profileOf(page:PageRow,plan:HubPlan):HubProfile{const p=JSON.parse(page.profile_json) as HubProfile;return {...p,showBranding:plan==='pro'?p.showBranding:true};}
function fromLink(row:LinkRow):HubLink{const content=readBlockContent(row.content_json);return {id:row.id,type:row.type,title:row.title,description:row.description,url:row.url,icon:row.icon,...(content?{content}:{}),enabled:!!row.enabled,featured:!!row.featured,sortOrder:row.sort_order,archived:!!row.archived};}
async function linksFor(pageId:string,includeArchived=true):Promise<HubLink[]>{const {results}=await db().prepare('SELECT * FROM hub_links WHERE page_id=?'+(includeArchived?'':' AND archived=0')+' ORDER BY sort_order,created_at,id').bind(pageId).all<LinkRow>();return results.map(fromLink);}
async function pageSummary(page:PageRow,plan:HubPlan,analyticsAccess:boolean):Promise<PageSummary>{
  const [links,events,control]=await Promise.all([
    db().prepare("SELECT COUNT(*) AS n FROM hub_links WHERE page_id=? AND archived=0").bind(page.id).first<{n:number}>(),
    analyticsAccess?db().prepare('SELECT type,COUNT(*) AS n FROM hub_events WHERE page_id=? GROUP BY type').bind(page.id).all<{type:string;n:number}>():Promise.resolve({results:[]}),
    db().prepare('SELECT suspended,reason FROM hub_page_controls WHERE page_id=?').bind(page.id).first<{suspended:number;reason:string}>(),
  ]);const profile=profileOf(page,plan);
  return {id:page.id,slug:page.slug,title:profile.name,profile,published:!!page.published,suspended:!!control?.suspended,suspensionReason:control?.suspended?control.reason:null,archived:!!page.archived,updatedAt:page.updated_at,publishedAt:page.published_at,linkCount:links?.n??0,totalClicks:analyticsAccess?(events.results.find(r=>r.type==='click')?.n??0):null,totalViews:analyticsAccess?(events.results.find(r=>r.type==='view')?.n??0):null,hasUnpublishedChanges:page.revision!==page.published_revision};
}
async function editorData(actor:AccountRow,page:PageRow):Promise<PageEditorData>{const {owner,access}=await resolveHubPageAccess(actor,page.id,page.account_id);const [summary,links]=await Promise.all([pageSummary(page,owner.plan,access.analytics),linksFor(page.id)]);return {page:{...summary,access},profile:profileOf(page,owner.plan),links,revision:page.revision,access};}
export async function getWorkspace(request:Request):Promise<WorkspaceData>{
  const account=await requireAccount(request);
  const [rows,archivedRows,usage,upgrade,info]=await Promise.all([
    db().prepare('SELECT * FROM hub_pages WHERE account_id=? AND archived=0 ORDER BY updated_at DESC,id').bind(account.id).all<PageRow>(),
    db().prepare('SELECT * FROM hub_pages WHERE account_id=? AND archived=1 ORDER BY updated_at DESC,id').bind(account.id).all<PageRow>(),
    db().prepare("SELECT COUNT(*) AS n FROM hub_links l JOIN hub_pages p ON p.id=l.page_id WHERE p.account_id=? AND p.archived=0 AND l.archived=0").bind(account.id).first<{n:number}>(),
    db().prepare('SELECT account_id FROM hub_upgrade_requests WHERE account_id=? AND resolved_at IS NULL').bind(account.id).first(),
    accountDTO(request,account),
  ]);
  const [pages,archivedPages]=await Promise.all([Promise.all(rows.results.map(p=>pageSummary(p,account.plan,info.entitlements.analytics))),Promise.all(archivedRows.results.map(p=>pageSummary(p,account.plan,info.entitlements.analytics)))]);
  const total=info.entitlements.analytics?await db().prepare("SELECT COUNT(*) AS n FROM hub_events e JOIN hub_pages p ON p.id=e.page_id WHERE p.account_id=? AND e.type='click'").bind(account.id).first<{n:number}>():null;
  const sharedRows=await db().prepare("SELECT DISTINCT p.* FROM hub_pages p JOIN hub_team_pages tp ON tp.page_id=p.id JOIN hub_teams t ON t.id=tp.team_id AND t.owner_account_id=p.account_id JOIN hub_team_members m ON m.team_id=t.id WHERE m.account_id=? AND m.status='active' AND t.archived=0 AND p.archived=0 AND p.account_id<>? ORDER BY p.updated_at DESC,p.id").bind(account.id,account.id).all<PageRow>();
  const sharedPages=await Promise.all(sharedRows.results.map(async page=>{const {owner,access}=await resolveHubPageAccess(account,page.id,page.account_id);return {...await pageSummary(page,owner.plan,access.analytics),access};}));
  return {account:info,limits:planLimits(account.plan),pages,archivedPages,sharedPages,usage:{pages:pages.length,links:usage?.n??0,totalClicks:info.entitlements.analytics?(total?.n??0):null},upgradeRequested:!!upgrade};
}
export function validateSlug(value:unknown):string{
  const slug=text(value,'ชื่อลิงก์',40,true);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length<3)throw new HubError(400,'ใช้ตัวอักษรอังกฤษเล็ก ตัวเลข และขีดกลาง 3–40 ตัว');
  if(RESERVED.has(slug))throw new HubError(400,'ชื่อนี้สงวนไว้สำหรับระบบ กรุณาเลือกชื่ออื่น');return slug;
}
export async function checkSlug(request:Request):Promise<{available:boolean;reason?:string}>{
  await requireAccount(request);let slug:string;try{slug=validateSlug(new URL(request.url).searchParams.get('slug')??'');}catch(error){if(error instanceof HubError)return {available:false,reason:error.message};throw error;}
  const exists=await db().prepare('SELECT id FROM hub_pages WHERE slug=?').bind(slug).first();return exists?{available:false,reason:'ชื่อลิงก์นี้ถูกใช้แล้ว'}:{available:true};
}
function initialProfile(name:string,slug:string,template:HubTemplate):HubProfile{
  return {name,handle:'@'+slug,tagline:'',bio:'',avatarUrl:'',shareImageUrl:'',accent:'#04878a',theme:'light',layout:template==='shop'?'grid':template==='business'?'editorial':'stack',background:template==='creator'?'lavender':template==='shop'?'sand':'mint',showBranding:true};
}
export async function createPage(request:Request):Promise<PageEditorData>{
  const account=await requireAccount(request);sameOrigin(request);const data=await body(request);keys(data,['name','slug','template']);
  const name=text(data.name,'ชื่อหน้า',80,true),slug=validateSlug(data.slug),template=data.template??'creator';
  if(!['creator','business','shop'].includes(String(template)))throw new HubError(400,'รูปแบบหน้าไม่ถูกต้อง');
  if(await db().prepare('SELECT id FROM hub_pages WHERE slug=?').bind(slug).first())throw new HubError(409,'ชื่อลิงก์นี้ถูกใช้แล้ว ลองเลือกชื่ออื่น');
  const id=crypto.randomUUID(),now=Date.now(),profile=initialProfile(name,slug,template as HubTemplate);
  const result=await db().prepare("INSERT INTO hub_pages (id,account_id,slug,profile_json,revision,published_revision,snapshot_json,published,archived,created_at,updated_at,published_at) SELECT ?,?,?,?,1,0,NULL,0,0,?,?,NULL WHERE (SELECT COUNT(*) FROM hub_pages WHERE account_id=? AND archived=0) < CASE (SELECT plan FROM hub_accounts WHERE id=?) WHEN 'pro' THEN 10 ELSE 1 END").bind(id,account.id,slug,JSON.stringify(profile),now,now,account.id,account.id).run();
  if(!result.meta.changes)throw new HubError(403,'จำนวนหน้าครบตามแพ็กเกจแล้ว เก็บหน้าที่ไม่ใช้เข้าคลังหรือขออัปเกรด Pro',{code:'page_limit'});
  return editorData(account,await ownPage(account,id));
}
export async function getPage(request:Request,id:string):Promise<PageEditorData>{const actor=await requireAccount(request);const {page}=await pageContext(actor,id);return editorData(actor,page);}

export function validateUrl(value:unknown):string{
  const clean=text(value,'ลิงก์ปลายทาง',2048,true);let url:URL;try{url=new URL(clean);}catch{throw new HubError(400,'ใส่ลิงก์เต็มที่ขึ้นต้นด้วย https:// หรือ mailto:');}
  if(url.protocol==='mailto:'){if(!/^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(url.pathname)||/%0[ad]/i.test(clean))throw new HubError(400,'อีเมลปลายทางไม่ถูกต้อง');return url.href;}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new HubError(400,'รองรับลิงก์ https://, http:// และ mailto: เท่านั้น');
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  const local=host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host==='::1'||host==='::'||/^(fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/i.test(host)||/^::ffff:/i.test(host);
  const ip=host.split('.').map(Number),privateIp=ip.length===4&&ip.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(ip[0]===0||ip[0]===10||ip[0]===127||ip[0]>=224||(ip[0]===169&&ip[1]===254)||(ip[0]===172&&ip[1]>=16&&ip[1]<=31)||(ip[0]===192&&ip[1]===168)||(ip[0]===100&&ip[1]>=64&&ip[1]<=127));
  if(!host||(!host.includes('.')&&!host.includes(':'))||local||privateIp)throw new HubError(400,'กรุณาใช้ลิงก์เว็บไซต์สาธารณะที่เข้าถึงได้');return url.href;
}
async function validateAvatar(value:unknown,account:AccountRow,pageId?:string,actorId?:string):Promise<string>{
  const url=text(value,'รูปโปรไฟล์',2048);if(!url)return '';
  if(url.startsWith('/media/')){
    const assetId=url.slice(7);if(!UUID.test(assetId))throw new HubError(400,'รูปโปรไฟล์ไม่ถูกต้อง');
    if(!await assetUsable(assetId,account.id,pageId,actorId))throw new HubError(400,'คุณไม่มีสิทธิ์ใช้รูปนี้ กรุณาอัปโหลดรูปของคุณ');return url;
  }
  const checked=validateUrl(url);if(!checked.startsWith('https://'))throw new HubError(400,'ลิงก์รูปโปรไฟล์ต้องใช้ https://');return checked;
}
async function validateUploadedImage(value:unknown,account:AccountRow,pageId?:string,actorId?:string,label='รูปภาพ',required=true):Promise<string>{
  const url=text(value,label,80,required);if(!url)return '';
  const assetId=url.startsWith('/media/')?url.slice(7):'';
  if(!UUID.test(assetId))throw new HubError(400,`${label}ต้องเป็นรูปที่อัปโหลดในฮับนี้`);
  if(!await assetUsable(assetId,account.id,pageId,actorId))throw new HubError(400,'คุณไม่มีสิทธิ์ใช้รูปนี้ กรุณาอัปโหลดรูปของคุณ');
  return '/media/'+assetId.toLowerCase();
}

async function validateProfile(input:unknown,current:HubProfile,account:AccountRow,pageId?:string,actorId?:string):Promise<HubProfile>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new HubError(400,'ข้อมูลโปรไฟล์ไม่ถูกต้อง');const data=input as Record<string,unknown>;
  keys(data,['name','handle','tagline','bio','avatarUrl','shareImageUrl','accent','themeId','theme','layout','background','showBranding']);let profile={...current};
  if('themeId'in data){
    if(typeof data.themeId!=='string'||data.themeId!=='custom'&&!getHubTheme(data.themeId))throw new HubError(400,'ไม่พบธีมนี้ กรุณาเลือกธีมจากคลัง');
    profile=data.themeId==='custom'?{...profile,themeId:'custom'}:applyHubTheme(profile,data.themeId);
  }
  for(const field of ['name','handle','tagline','bio'] as const)if(field in data)profile[field]=text(data[field],field==='name'?'ชื่อหน้า':'ข้อความ',field==='bio'?280:field==='tagline'?120:80,field==='name');
  if('avatarUrl'in data)profile.avatarUrl=await validateAvatar(data.avatarUrl,account,pageId,actorId);
  if('shareImageUrl'in data)profile.shareImageUrl=await validateUploadedImage(data.shareImageUrl,account,pageId,actorId,'ภาพปกเวลาแชร์',false);
  if('accent'in data){if(typeof data.accent!=='string'||!/^#[0-9a-f]{6}$/i.test(data.accent))throw new HubError(400,'รหัสสีต้องเป็น #RRGGBB');profile.accent=data.accent;}
  if('theme'in data){if(data.theme!=='light'&&data.theme!=='dark')throw new HubError(400,'ธีมไม่ถูกต้อง');profile.theme=data.theme;}
  if('layout'in data){if(!['stack','grid','editorial'].includes(String(data.layout)))throw new HubError(400,'เลย์เอาต์ไม่ถูกต้อง');profile.layout=data.layout as HubProfile['layout'];}
  if('background'in data){if(!['sand','mint','lavender','ink'].includes(String(data.background)))throw new HubError(400,'พื้นหลังไม่ถูกต้อง');profile.background=data.background as HubProfile['background'];}
  if('showBranding'in data){if(typeof data.showBranding!=='boolean')throw new HubError(400,'สถานะแบรนด์ไม่ถูกต้อง');if(!data.showBranding&&account.plan!=='pro')throw new HubError(403,'การซ่อนแบรนด์นากนะ HUB ใช้ได้ใน Pro',{code:'pro_required'});profile.showBranding=data.showBranding;}
  if(account.plan!=='pro')profile.showBranding=true;return profile;
}
export async function updatePage(request:Request,id:string):Promise<PageEditorData>{
  const actor=await requireAccount(request);sameOrigin(request);const data=await body(request);keys(data,['profile','slug','archived','revision']);
  const {page,owner:account,access}=await pageContext(actor,id,'edit',true);
  if('archived'in data){
    if(!access.canManage)throw new HubError(403,'เฉพาะเจ้าของฮับเท่านั้นที่กู้คืนฮับได้');
    if(data.archived!==false||Object.keys(data).some(k=>!['archived','revision'].includes(k)))throw new HubError(400,'ใช้คำสั่งนี้เพื่อกู้คืนหน้าเท่านั้น');
    if(!page.archived)return editorData(actor,page);
    const result=await db().prepare("UPDATE hub_pages SET archived=0,updated_at=?,revision=revision+1 WHERE id=? AND account_id=? AND archived=1 AND (SELECT COUNT(*) FROM hub_pages WHERE account_id=? AND archived=0)<CASE (SELECT plan FROM hub_accounts WHERE id=?) WHEN 'pro' THEN 10 ELSE 1 END AND (SELECT COUNT(*) FROM hub_links WHERE page_id=? AND archived=0)<=CASE (SELECT plan FROM hub_accounts WHERE id=?) WHEN 'pro' THEN 100 ELSE 5 END").bind(Date.now(),id,account.id,account.id,account.id,id,account.id).run();
    if(!result.meta.changes)throw new HubError(403,'จำนวนหน้าครบตามแพ็กเกจแล้ว',{code:'page_limit'});return editorData(actor,await ownPage(account,id));
  }
  clientRevision(data.revision,page);
  if(page.archived)throw new HubError(404,'หน้านี้อยู่ในคลัง กรุณากู้คืนก่อนแก้ไข');
  const profile='profile'in data?await validateProfile(data.profile,profileOf(page,account.plan),account,id,actor.id):profileOf(page,account.plan);
  const slug='slug'in data?validateSlug(data.slug):page.slug;
  if(slug!==page.slug&&!access.canManage)throw new HubError(403,'เฉพาะเจ้าของฮับเท่านั้นที่เปลี่ยน URL ได้');
  if(slug!==page.slug&&page.published)throw new HubError(409,'หยุดเผยแพร่หน้าก่อนเปลี่ยนชื่อลิงก์ เพื่อไม่ให้ URL ที่แชร์ไว้เปลี่ยนโดยไม่ตั้งใจ');
  if(slug!==page.slug&&await db().prepare('SELECT id FROM hub_pages WHERE slug=? AND id<>?').bind(slug,id).first())throw new HubError(409,'ชื่อลิงก์นี้ถูกใช้แล้ว');
  if(!('profile'in data)&&!('slug'in data))throw new HubError(400,'ไม่มีข้อมูลให้แก้ไข');
  const result=await db().prepare('UPDATE hub_pages SET profile_json=?,slug=?,revision=revision+1,updated_at=? WHERE id=? AND account_id=? AND revision=? AND archived=0 AND (?=0 OR published=0) AND '+teamWriteGuard()).bind(JSON.stringify(profile),slug,Date.now(),id,account.id,page.revision,+(slug!==page.slug),actor.id,actor.id).run();
  if(!result.meta.changes)throw new HubError(409,'ข้อมูลหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาโหลดใหม่ก่อนบันทึก');await recordTeamPageActivity(actor,account.id,id,'แก้ไขโปรไฟล์และดีไซน์ฮับ');return editorData(actor,await ownPage(account,id));
}
export async function archivePage(request:Request,id:string):Promise<void>{
  const account=await requireAccount(request);sameOrigin(request);await ownPage(account,id);
  const result=await db().prepare('UPDATE hub_pages SET archived=1,published=0,snapshot_json=NULL,revision=revision+1,updated_at=? WHERE id=? AND account_id=? AND archived=0').bind(Date.now(),id,account.id).run();if(!result.meta.changes)throw new HubError(404,'ไม่พบหน้านี้');
}
const LINK_KEYS=['type','title','description','url','icon','content','enabled','featured','sortOrder','archived'] as const;
async function validateLinkIcon(value:unknown,account:AccountRow,pageId?:string,actorId?:string):Promise<string>{
  const icon=text(value,'ไอคอน',80,true),assetId=imageAssetId(icon);
  if(assetId){
    if(!await assetUsable(assetId,account.id,pageId,actorId))throw new HubError(400,'คุณไม่มีสิทธิ์ใช้รูปนี้ กรุณาอัปโหลดรูปของคุณ');
    return 'image:'+assetId;
  }
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(icon))throw new HubError(400,'ไอคอนไม่ถูกต้อง');
  return icon;
}
function contentText(value:unknown,label:string,max:number,required=false):string{
  const clean=text(value,label,max,required);
  if(/<\/?[a-z][^>]*>/i.test(clean))throw new HubError(400,`${label}รองรับข้อความธรรมดา ไม่รองรับโค้ด HTML`);
  return clean;
}
async function validateBlockContent(value:unknown,type:HubLink['type'],title:string,account:AccountRow,pageId?:string,actorId?:string):Promise<HubBlockContent|undefined>{
  if(value===undefined)value={};
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HubError(400,'รายละเอียดเนื้อหาไม่ถูกต้อง');
  const input=value as Record<string,unknown>;
  const allowed=type==='gallery'?['images','galleryLayout','aspectRatio','fit','buttonLabel']
    :type==='image'?['imageUrl','alt','aspectRatio','fit','buttonLabel']
    :type==='service'?['imageUrl','alt','aspectRatio','fit','buttonLabel','price']:[];
  keys(input,allowed);
  if(!['image','gallery','service'].includes(type))return undefined;
  const content:HubBlockContent={};
  if(type==='image'||type==='service'){
    const url=await validateUploadedImage(input.imageUrl??'',account,pageId,actorId,'รูปภาพ',type==='image');
    if(url)content.imageUrl=url;
    content.alt=contentText(input.alt??title,'คำอธิบายรูป',240)||title;
  }
  if(type==='gallery'){
    if(!Array.isArray(input.images)||input.images.length<1||input.images.length>HUB_GALLERY_LIMIT)throw new HubError(400,`เพิ่มรูปในแกลเลอรี 1–${HUB_GALLERY_LIMIT} รูป`);
    content.images=[];
    for(const entry of input.images){
      if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new HubError(400,'รูปในแกลเลอรีไม่ถูกต้อง');
      const image=entry as Record<string,unknown>;keys(image,['url','alt','caption']);
      const url=await validateUploadedImage(image.url,account,pageId,actorId,'รูปในแกลเลอรี');
      const alt=contentText(image.alt??title,'คำอธิบายรูป',240)||title;
      const caption=contentText(image.caption??'','คำบรรยายรูป',300);
      content.images.push({url,alt,...(caption?{caption}:{})});
    }
    if(new Set(content.images.map(image=>image.url)).size!==content.images.length)throw new HubError(400,'มีรูปซ้ำในแกลเลอรี กรุณาเลือกรูปอื่น');
    if('galleryLayout'in input&&(typeof input.galleryLayout!=='string'||!['grid','carousel'].includes(input.galleryLayout)))throw new HubError(400,'รูปแบบแกลเลอรีไม่ถูกต้อง');
    content.galleryLayout=(input.galleryLayout??'grid') as 'grid'|'carousel';
  }
  if('aspectRatio'in input&&(typeof input.aspectRatio!=='string'||!['landscape','square','portrait','auto'].includes(input.aspectRatio)))throw new HubError(400,'สัดส่วนรูปไม่ถูกต้อง');
  if('fit'in input&&(typeof input.fit!=='string'||!['cover','contain'].includes(input.fit)))throw new HubError(400,'การแสดงรูปไม่ถูกต้อง');
  content.aspectRatio=(input.aspectRatio??(type==='gallery'?'square':'landscape')) as HubBlockContent['aspectRatio'];
  content.fit=(input.fit??'contain') as HubBlockContent['fit'];
  content.buttonLabel=contentText(input.buttonLabel??'','ข้อความปุ่ม',60);
  if(type==='service')content.price=contentText(input.price??'','ราคา',80);
  return content;
}
async function validateLink(data:Record<string,unknown>,account:AccountRow,existing?:HubLink,pageId?:string,actorId?:string):Promise<Omit<HubLink,'id'>>{
  keys(data,LINK_KEYS);const link:Omit<HubLink,'id'>=existing?{type:existing.type,title:existing.title,description:existing.description,url:existing.url,icon:existing.icon,...(existing.content?{content:existing.content}:{}),enabled:existing.enabled,featured:existing.featured,sortOrder:existing.sortOrder,archived:existing.archived}:{type:'link',title:'',description:'',url:'',icon:'auto',enabled:true,featured:false,sortOrder:0,archived:false};
  if('type'in data){if(!isHubContentType(data.type))throw new HubError(400,'ประเภทบล็อกไม่ถูกต้อง');link.type=data.type;}
  const rich=isRichContentType(link.type);
  for(const field of ['title','description'] as const)link[field]=(rich?contentText:text)(field in data?data[field]:link[field],field==='title'?'ชื่อรายการ':'คำอธิบาย',field==='title'?100:rich?2000:220,field==='title');
  if(!link.title)throw new HubError(400,'กรอกชื่อรายการ');
  if(link.type==='text'&&!link.description)throw new HubError(400,'กรอกข้อความที่ต้องการแสดง');
  link.icon=await validateLinkIcon('icon'in data?data.icon:link.icon,account,pageId,actorId);
  if('url'in data)link.url=text(data.url,'ลิงก์ปลายทาง',2048);
  if(link.type==='link')link.url=validateUrl(link.url);
  else if(['image','gallery','service'].includes(link.type)){if(link.url)link.url=validateUrl(link.url);}
  else {link.url='';link.featured=false;}
  const content=await validateBlockContent('content'in data?data.content:existing?.type===link.type?link.content:undefined,link.type,link.title,account,pageId,actorId);
  if(content)link.content=content;else delete link.content;
  for(const field of ['enabled','featured','archived'] as const)if(field in data){if(typeof data[field]!=='boolean')throw new HubError(400,'สถานะบล็อกไม่ถูกต้อง');link[field]=data[field] as boolean;}
  if(link.type==='heading'||link.type==='text')link.featured=false;
  if('sortOrder'in data){if(!Number.isInteger(data.sortOrder)||(data.sortOrder as number)<0||(data.sortOrder as number)>100000)throw new HubError(400,'ลำดับไม่ถูกต้อง');link.sortOrder=data.sortOrder as number;}
  return link;
}
export async function createLink(request:Request,pageId:string):Promise<HubLink>{
  const actor=await requireAccount(request);sameOrigin(request);const {page,owner:account}=await pageContext(actor,pageId,'edit');const data=await body(request);clientRevision(data.revision,page);delete data.revision;const link=await validateLink(data,account,undefined,pageId,actor.id);link.archived=false;
  const max=await db().prepare('SELECT MAX(sort_order) AS n FROM hub_links WHERE page_id=?').bind(pageId).first<{n:number|null}>();if(!('sortOrder'in data))link.sortOrder=(max?.n??-1)+1;
  const id=crypto.randomUUID(),now=Date.now();
  const results=await db().batch([
    db().prepare("INSERT INTO hub_links (id,page_id,type,title,description,url,icon,content_json,enabled,featured,sort_order,archived,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM hub_pages WHERE id=? AND account_id=? AND archived=0 AND revision=? AND "+teamWriteGuard()+") AND (SELECT COUNT(*) FROM hub_links WHERE page_id=? AND archived=0)<CASE (SELECT plan FROM hub_accounts WHERE id=?) WHEN 'pro' THEN 100 ELSE 5 END").bind(id,pageId,link.type,link.title,link.description,link.url,link.icon,JSON.stringify(link.content??{}),+link.enabled,+link.featured,link.sortOrder,now,pageId,account.id,page.revision,actor.id,actor.id,pageId,account.id),
    db().prepare('UPDATE hub_pages SET revision=revision+1,updated_at=? WHERE id=? AND account_id=? AND EXISTS(SELECT 1 FROM hub_links WHERE id=? AND page_id=?)').bind(now,pageId,account.id,id,pageId),
  ]);
  if(!results[0].meta.changes)throw new HubError(409,'บันทึกไม่ได้ จำนวนบล็อกเต็ม หรือข้อมูลและสิทธิ์เปลี่ยนไป กรุณาโหลดใหม่',{code:'link_write_conflict'});await recordTeamPageActivity(actor,account.id,pageId,'เพิ่มเนื้อหาในฮับ');return {id,...link};
}
export async function updateLink(request:Request,pageId:string,linkId:string):Promise<HubLink>{
  const actor=await requireAccount(request);sameOrigin(request);const {page,owner:account}=await pageContext(actor,pageId,'edit');const existing=await db().prepare('SELECT * FROM hub_links WHERE id=? AND page_id=?').bind(linkId,pageId).first<LinkRow>();if(!existing)throw new HubError(404,'ไม่พบบล็อกนี้');
  const data=await body(request);clientRevision(data.revision,page);delete data.revision;if(!Object.keys(data).length)throw new HubError(400,'ไม่มีข้อมูลให้แก้ไข');const link=await validateLink(data,account,fromLink(existing),pageId,actor.id);
  const restoring=existing.archived===1&&!link.archived;
  const results=await db().batch([
    db().prepare("UPDATE hub_links SET type=?,title=?,description=?,url=?,icon=?,content_json=?,enabled=?,featured=?,sort_order=?,archived=? WHERE id=? AND page_id=? AND EXISTS(SELECT 1 FROM hub_pages WHERE id=? AND account_id=? AND archived=0 AND revision=? AND "+teamWriteGuard()+") AND (?=0 OR (SELECT COUNT(*) FROM hub_links WHERE page_id=? AND archived=0)<CASE (SELECT plan FROM hub_accounts WHERE id=?) WHEN 'pro' THEN 100 ELSE 5 END)").bind(link.type,link.title,link.description,link.url,link.icon,JSON.stringify(link.content??{}),+link.enabled,+link.featured,link.sortOrder,+link.archived,linkId,pageId,pageId,account.id,page.revision,actor.id,actor.id,+restoring,pageId,account.id),
    db().prepare('UPDATE hub_pages SET revision=revision+1,updated_at=? WHERE id=? AND account_id=? AND changes()>0').bind(Date.now(),pageId,account.id),
  ]);
  if(!results[0].meta.changes)throw new HubError(409,'ร่างหรือสิทธิ์มีการเปลี่ยนแปลง หรือจำนวนบล็อกเต็ม กรุณาโหลดใหม่ก่อนแก้ไข');await recordTeamPageActivity(actor,account.id,pageId,'แก้ไขลิงก์หรือรูปภาพ');return {id:linkId,...link};
}
export async function archiveLink(request:Request,pageId:string,linkId:string):Promise<void>{
  const actor=await requireAccount(request);sameOrigin(request);const {page,owner:account}=await pageContext(actor,pageId,'edit');clientRevision(Number(new URL(request.url).searchParams.get('revision')),page);
  const results=await db().batch([
    db().prepare('UPDATE hub_links SET archived=1,enabled=0 WHERE id=? AND page_id=? AND archived=0 AND EXISTS(SELECT 1 FROM hub_pages WHERE id=? AND account_id=? AND archived=0 AND revision=? AND '+teamWriteGuard()+')').bind(linkId,pageId,pageId,account.id,page.revision,actor.id,actor.id),
    db().prepare('UPDATE hub_pages SET revision=revision+1,updated_at=? WHERE id=? AND account_id=? AND changes()>0').bind(Date.now(),pageId,account.id),
  ]);if(!results[0].meta.changes)throw new HubError(409,'รายการหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาโหลดใหม่');await recordTeamPageActivity(actor,account.id,pageId,'เก็บลิงก์เข้าคลัง');
}
export async function reorderLinks(request:Request,pageId:string):Promise<HubLink[]>{
  const actor=await requireAccount(request);sameOrigin(request);const {page,owner:account}=await pageContext(actor,pageId,'edit'),data=await body(request);keys(data,['ids','revision']);clientRevision(data.revision,page);
  if(!Array.isArray(data.ids)||data.ids.length>100||!data.ids.every(v=>typeof v==='string')||new Set(data.ids).size!==data.ids.length)throw new HubError(400,'ลำดับบล็อกไม่ถูกต้อง');const ids=data.ids as string[],current=await linksFor(pageId,false);
  if(ids.length!==current.length||current.some(l=>!ids.includes(l.id)))throw new HubError(409,'รายการบล็อกเปลี่ยนไปแล้ว กรุณาโหลดใหม่');
  const now=Date.now();
  const results=await db().batch([
    ...ids.map((id,i)=>db().prepare('UPDATE hub_links SET sort_order=? WHERE id=? AND page_id=? AND EXISTS(SELECT 1 FROM hub_pages WHERE id=? AND account_id=? AND archived=0 AND revision=? AND '+teamWriteGuard()+')').bind(i,id,pageId,pageId,account.id,page.revision,actor.id,actor.id)),
    db().prepare('UPDATE hub_pages SET revision=revision+1,updated_at=? WHERE id=? AND account_id=? AND archived=0 AND revision=? AND '+teamWriteGuard()).bind(now,pageId,account.id,page.revision,actor.id,actor.id),
  ]);if(!results[results.length-1].meta.changes)throw new HubError(409,'ข้อมูลหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาโหลดใหม่');await recordTeamPageActivity(actor,account.id,pageId,'จัดลำดับลิงก์');return linksFor(pageId);
}
export async function publishPage(request:Request,id:string):Promise<PageEditorData>{
  const actor=await requireAccount(request);sameOrigin(request);const {page,owner:account}=await pageContext(actor,id,'publish'),data=await body(request,true);keys(data,['revision']);clientRevision(data.revision,page);
  if(await db().prepare('SELECT page_id FROM hub_page_controls WHERE page_id=? AND suspended=1').bind(id).first())throw new HubError(403,'ฮับนี้ถูกพักการเผยแพร่โดยผู้ดูแล กรุณาติดต่อผู้ดูแลก่อนเผยแพร่อีกครั้ง',{code:'hub_suspended'});
  const profile=profileOf(page,account.plan),links=(await linksFor(id,false)).filter(l=>l.enabled);
  if(!links.some(l=>l.type!=='heading'))throw new HubError(400,'เพิ่มเนื้อหาที่เปิดใช้งานอย่างน้อย 1 รายการก่อนเผยแพร่');
  for(const link of links){const {id:_id,...payload}=link;await validateLink(payload,account,link,id,actor.id);}
  if(profile.shareImageUrl)await validateUploadedImage(profile.shareImageUrl,account,id,actor.id,'ภาพปกเวลาแชร์');
  const snapshot:Snapshot={profile,links,revision:page.revision},now=Date.now();
  const result=await db().prepare('UPDATE hub_pages SET snapshot_json=?,published=1,published_revision=?,published_at=?,updated_at=? WHERE id=? AND account_id=? AND archived=0 AND revision=? AND NOT EXISTS(SELECT 1 FROM hub_page_controls c WHERE c.page_id=hub_pages.id AND c.suspended=1) AND '+teamWriteGuard('hub_pages','publish')).bind(JSON.stringify(snapshot),page.revision,now,now,id,account.id,page.revision,actor.id,actor.id).run();
  if(!result.meta.changes)throw new HubError(409,'ร่างหรือสิทธิ์เปลี่ยนไประหว่างเผยแพร่ กรุณาโหลดใหม่');await recordTeamPageActivity(actor,account.id,id,'เผยแพร่ฮับ');return editorData(actor,await ownPage(account,id));
}
export async function unpublishPage(request:Request,id:string):Promise<PageEditorData>{
  const actor=await requireAccount(request);sameOrigin(request);const {page,owner:account}=await pageContext(actor,id,'publish'),data=await body(request,true);keys(data,['revision']);clientRevision(data.revision,page);
  const result=await db().prepare('UPDATE hub_pages SET published=0,snapshot_json=NULL,revision=revision+1,updated_at=? WHERE id=? AND account_id=? AND archived=0 AND revision=? AND '+teamWriteGuard('hub_pages','publish')).bind(Date.now(),id,account.id,page.revision,actor.id,actor.id).run();if(!result.meta.changes)throw new HubError(409,'ข้อมูลหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาโหลดใหม่');await recordTeamPageActivity(actor,account.id,id,'หยุดเผยแพร่ฮับ');return editorData(actor,await ownPage(account,id));
}
type PublicRow=PageRow&{owner_user_id:string;owner_plan:HubPlan};
async function publicPage(value:string,byId=false):Promise<PublicRow>{
  const row=await db().prepare('SELECT p.*,a.user_id AS owner_user_id,a.plan AS owner_plan FROM hub_pages p JOIN hub_accounts a ON a.id=p.account_id WHERE p.'+(byId?'id':'slug')+'=? AND p.published=1 AND p.archived=0 AND p.snapshot_json IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hub_page_controls c WHERE c.page_id=p.id AND c.suspended=1)').bind(value).first<PublicRow>();
  if(!row)throw new HubError(404,'หน้านี้ยังไม่เผยแพร่ หรือไม่พบหน้านี้');
  if(row.owner_plan==='pro'&&await expireBillingEntitlement(db(),row.account_id))row.owner_plan='starter';
  return row;
}
function snapshotOf(row:PublicRow):Snapshot{const snapshot=JSON.parse(row.snapshot_json!) as Snapshot;return {...snapshot,profile:{...snapshot.profile,showBranding:row.owner_plan==='pro'?snapshot.profile.showBranding:true}};}
export async function getPublicHub(request:Request,slug:string):Promise<PublicHubData>{
  const page=await publicPage(slug),snapshot=snapshotOf(page);return {pageId:page.id,slug:page.slug,profile:snapshot.profile,links:snapshot.links,publishedAt:page.published_at!,isOwner:identity(request)?.userId===page.owner_user_id||!!identity(request)&&await isHubEditorIdentity(identity(request)!.userId,page.id,page.account_id)};
}
const AUTOMATED=/bot\b|crawler|spider|facebookexternalhit|facebookcatalog|slackbot|discordbot|telegrambot|whatsapp|preview|lighthouse|headless|linkexpand|embedly|pinterest|skypeuripreview/i;
function automated(request:Request):boolean{return request.method==='HEAD'||AUTOMATED.test(request.headers.get('user-agent')??'')||/prefetch|prerender|preview/i.test([request.headers.get('purpose'),request.headers.get('sec-purpose'),request.headers.get('x-purpose')].filter(Boolean).join(' '));}
function device(request:Request):string{const ua=request.headers.get('user-agent')??'';return /ipad|tablet|android(?!.*mobile)/i.test(ua)?'แท็บเล็ต':/mobile|iphone|ipod|android/i.test(ua)?'มือถือ':'คอมพิวเตอร์';}
function normalizeSource(value:string):string{
  const source=value.trim().toLowerCase().slice(0,160);if(!source||['direct','none','เข้าหน้าโดยตรง'].includes(source))return 'เข้าหน้าโดยตรง';let host=source;
  try{if(source.includes('://'))host=new URL(source).hostname;}catch{return 'เว็บไซต์อื่น';}
  if(['facebook','fb','ig_fb'].includes(host)||/(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(host))return 'Facebook';
  if(['instagram','ig'].includes(host)||/(^|\.)instagram\.com$/.test(host))return 'Instagram';
  if(['tiktok','tt'].includes(host)||/(^|\.)tiktok\.com$/.test(host))return 'TikTok';
  if(['line','lineoa','line_oa'].includes(host)||/(^|\.)line\.me$|(^|\.)lin\.ee$/.test(host))return 'LINE';
  if(host==='google'||/(^|\.)google\.[a-z.]+$/.test(host))return 'Google';
  if(['youtube','yt'].includes(host)||/(^|\.)youtube\.com$|^youtu\.be$/.test(host))return 'YouTube';
  if(['x','twitter','x.com','twitter.com','t.co'].includes(host))return 'X';return 'เว็บไซต์อื่น';
}
function sourceFor(request:Request,supplied?:string):string{
  if(supplied!==undefined)return normalizeSource(supplied);const url=new URL(request.url),source=url.searchParams.get('src')??url.searchParams.get('utm_source');if(source!==null)return normalizeSource(source);
  try{const ref=request.headers.get('referer');if(ref){const parsed=new URL(ref);if(parsed.origin!==url.origin)return normalizeSource(parsed.hostname);}}catch{}return 'เข้าหน้าโดยตรง';
}
async function recordEvent(request:Request,page:PublicRow,type:'view'|'click',id:string,linkId:string|null,source?:string):Promise<void>{
  if(automated(request)||identity(request)?.userId===page.owner_user_id)return;
  const user=identity(request);if(user&&await isHubEditorIdentity(user.userId,page.id,page.account_id))return;
  await db().prepare('INSERT OR IGNORE INTO hub_events (id,page_id,type,link_id,created_at,device,source) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM hub_pages WHERE id=? AND published=1 AND archived=0 AND NOT EXISTS(SELECT 1 FROM hub_page_controls c WHERE c.page_id=hub_pages.id AND c.suspended=1))').bind(id,page.id,type,linkId,Date.now(),device(request),sourceFor(request,source),page.id).run();
}
export async function recordView(request:Request):Promise<void>{
  sameOrigin(request);const data=await body(request);keys(data,['id','type','pageId','source']);
  if(data.type!=='view'||typeof data.id!=='string'||!UUID.test(data.id)||typeof data.pageId!=='string'||!UUID.test(data.pageId))throw new HubError(400,'ข้อมูลการเข้าชมไม่ถูกต้อง');
  const source=data.source===undefined?undefined:text(data.source,'แหล่งที่มา',160),page=await publicPage(data.pageId,true);await recordEvent(request,page,'view',data.id,null,source);
}
export async function goToLink(request:Request,slug:string,linkId:string):Promise<Response>{
  const page=await publicPage(slug),snapshot=snapshotOf(page),link=snapshot.links.find(l=>l.id===linkId&&hasBlockAction(l)&&l.enabled&&!l.archived);
  if(!link)throw new HubError(404,'ไม่พบลิงก์นี้ในหน้าที่เผยแพร่');const target=validateUrl(link.url);
  try{await recordEvent(request,page,'click',crypto.randomUUID(),link.id);}catch(error){console.error('HUB click recording failed',error instanceof Error?error.message:'Unknown error');}
  return new Response(null,{status:302,headers:{Location:target,'Cache-Control':'no-store, max-age=0','Referrer-Policy':'strict-origin-when-cross-origin','X-Robots-Tag':'noindex, nofollow'}});
}
function parseRange(value:string|null):AnalyticsRange{if(value===null)return '7d';if(!['today','7d','30d','all'].includes(value))throw new HubError(400,'ช่วงเวลาไม่ถูกต้อง');return value as AnalyticsRange;}
function startOfRange(range:AnalyticsRange,now:number):number{if(range==='all')return 0;const day=86400000,offset=25200000,midnight=Math.floor((now+offset)/day)*day-offset;return midnight-(range==='7d'?6:range==='30d'?29:0)*day;}
// This is an event ratio, not unique-visitor conversion. Multiple clicks from
// one page view can exceed 100%; no views means the rate cannot be calculated.
function clickRate(clicks:number,views:number):number|null{return views>0?Math.round(clicks/views*1000)/10:null;}
export async function analytics(request:Request,pageId:string):Promise<AnalyticsData>{
  const actor=await requireAccount(request);const {owner:account}=await pageContext(actor,pageId,'view',true);await requireAnalytics(account);const params=new URL(request.url).searchParams,range=parseRange(params.get('range')),now=Date.now(),start=startOfRange(range,now);
  const requestedLink=params.get('linkId');let selected:LinkRow|null=null;
  if(requestedLink!==null){
    if(!UUID.test(requestedLink)||params.getAll('linkId').length!==1)throw new HubError(400,'ลิงก์ที่เลือกไม่ถูกต้อง');
    selected=await db().prepare("SELECT l.* FROM hub_links l WHERE l.id=? AND l.page_id=? AND ((l.type IN ('link','image','gallery','service') AND l.url<>'') OR EXISTS(SELECT 1 FROM hub_events e WHERE e.link_id=l.id AND e.page_id=l.page_id AND e.type='click'))").bind(requestedLink,pageId).first<LinkRow>();
    if(!selected)throw new HubError(404,'ไม่พบลิงก์นี้ในฮับของคุณ');
  }
  const [totals,ranking,daily,devices,sources,active]=await Promise.all([
    db().prepare('SELECT type,COUNT(*) AS n FROM hub_events WHERE page_id=? AND created_at>=? AND created_at<=? GROUP BY type').bind(pageId,start,now).all<{type:string;n:number}>(),
    db().prepare("SELECT l.id,l.title,l.url,l.icon,l.enabled,l.archived,COUNT(e.id) AS clicks FROM hub_links l LEFT JOIN hub_events e ON e.link_id=l.id AND e.page_id=l.page_id AND e.type='click' AND e.created_at>=? AND e.created_at<=? WHERE l.page_id=? AND ((l.type IN ('link','image','gallery','service') AND l.url<>'') OR EXISTS(SELECT 1 FROM hub_events old WHERE old.link_id=l.id AND old.page_id=l.page_id AND old.type='click')) GROUP BY l.id ORDER BY clicks DESC,l.sort_order,l.id").bind(start,now,pageId).all<{id:string;title:string;url:string;icon:string;enabled:number;archived:number;clicks:number}>(),
    db().prepare("SELECT date(created_at/1000,'unixepoch','+7 hours') AS date,SUM(CASE WHEN type='click' THEN 1 ELSE 0 END) AS clicks,SUM(CASE WHEN type='view' THEN 1 ELSE 0 END) AS views FROM hub_events WHERE page_id=? AND created_at>=? AND created_at<=? GROUP BY date ORDER BY date").bind(pageId,start,now).all<{date:string;clicks:number;views:number}>(),
    db().prepare("SELECT device AS name,COUNT(*) AS count FROM hub_events WHERE page_id=? AND type='click' AND created_at>=? AND created_at<=? GROUP BY device ORDER BY count DESC").bind(pageId,start,now).all<{name:string;count:number}>(),
    db().prepare("SELECT source AS name,COUNT(*) AS count FROM hub_events WHERE page_id=? AND type='view' AND created_at>=? AND created_at<=? GROUP BY source ORDER BY count DESC").bind(pageId,start,now).all<{name:string;count:number}>(),
    db().prepare("SELECT COUNT(*) AS n FROM hub_links WHERE page_id=? AND archived=0 AND enabled=1 AND type IN ('link','image','gallery','service') AND url<>''").bind(pageId).first<{n:number}>(),
  ]);
  const totalClicks=totals.results.find(t=>t.type==='click')?.n??0,totalViews=totals.results.find(t=>t.type==='view')?.n??0,lookup=new Map(daily.results.map(d=>[d.date,d]));
  const days:AnalyticsData['daily']=[];if(range==='all')days.push(...daily.results);else{const first=new Date(start+25200000).toISOString().slice(0,10),last=new Date(now+25200000).toISOString().slice(0,10);for(let date=first;date<=last;date=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10))days.push(lookup.get(date)??{date,clicks:0,views:0});}
  const ranked=ranking.results.map(r=>({...r,enabled:!!r.enabled,archived:!!r.archived,share:totalClicks?Math.round(r.clicks/totalClicks*1000)/10:0,clickRate:clickRate(r.clicks,totalViews)}));
  let selectedLink:AnalyticsData['selectedLink'];
  if(selected){
    const [selectedDaily,selectedDevices,selectedSources]=await Promise.all([
      db().prepare("SELECT date(created_at/1000,'unixepoch','+7 hours') AS date,COUNT(*) AS clicks FROM hub_events WHERE page_id=? AND link_id=? AND type='click' AND created_at>=? AND created_at<=? GROUP BY date ORDER BY date").bind(pageId,selected.id,start,now).all<{date:string;clicks:number}>(),
      db().prepare("SELECT device AS name,COUNT(*) AS count FROM hub_events WHERE page_id=? AND link_id=? AND type='click' AND created_at>=? AND created_at<=? GROUP BY device ORDER BY count DESC,name").bind(pageId,selected.id,start,now).all<{name:string;count:number}>(),
      db().prepare("SELECT source AS name,COUNT(*) AS count FROM hub_events WHERE page_id=? AND link_id=? AND type='click' AND created_at>=? AND created_at<=? GROUP BY source ORDER BY count DESC,name").bind(pageId,selected.id,start,now).all<{name:string;count:number}>(),
    ]);
    const row=ranked.find(r=>r.id===selected.id)!,selectedDays=new Map(selectedDaily.results.map(day=>[day.date,day.clicks]));
    selectedLink={id:row.id,title:row.title,url:row.url,icon:row.icon,clicks:row.clicks,share:row.share,clickRate:row.clickRate,daily:days.map(day=>({date:day.date,clicks:selectedDays.get(day.date)??0})),devices:selectedDevices.results,sources:selectedSources.results};
  }
  return {pageId,range,totalClicks,totalViews,clickRate:clickRate(totalClicks,totalViews),activeLinks:active?.n??0,ranking:ranked,daily:days,devices:devices.results,sources:sources.results,...(selectedLink?{selectedLink}:{})};
}
function csvCell(value:string|number):string{let clean=String(value);if(typeof value==='string'&&/^[\s]*[=+\-@\t\r]/.test(clean))clean="'"+clean;return '"'+clean.replace(/"/g,'""')+'"';}
export async function exportAnalytics(request:Request,pageId:string):Promise<Response>{
  const data=await analytics(request,pageId),selected=data.selectedLink,links=selected?data.ranking.filter(link=>link.id===selected.id):data.ranking;
  const rows:Array<Array<string|number>>=[['อันดับ','ชื่อลิงก์','URL','จำนวนคลิก','สัดส่วนจากคลิกทั้งฮับ (%)','คลิกต่อการเข้าชม (%)','ช่วงเวลา (เวลาไทย)'],...links.map(l=>[data.ranking.findIndex(row=>row.id===l.id)+1,l.title,l.url,l.clicks,l.share,l.clickRate??'',data.range]),[],['ขอบเขต',selected?selected.title:'ทุกลิงก์ในฮับ'],['ยอดคลิก',selected?.clicks??data.totalClicks],['ยอดเปิดหน้าฮับ',data.totalViews],['คลิกต่อการเข้าชม (%)',(selected?.clickRate??(selected?null:data.clickRate))??''],['สูตร','จำนวนคลิก ÷ จำนวนครั้งที่เข้าชมฮับ × 100'],['หมายเหตุ','นับเป็นครั้ง ไม่ใช่จำนวนคน อัตราอาจเกิน 100% เมื่อมีการคลิกหลายครั้งต่อการเข้าชม; ช่องว่างหมายถึงยังไม่มีการเข้าชม'],[],['วันที่ (เวลาไทย)','จำนวนคลิก','ยอดเปิดหน้าฮับ'],...(selected?selected.daily.map(day=>[day.date,day.clicks,data.daily.find(row=>row.date===day.date)?.views??0]):data.daily.map(day=>[day.date,day.clicks,day.views]))];
  const date=new Date(Date.now()+25200000).toISOString().slice(0,10);return new Response('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="nakna-hub-${data.range}-${date}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

function imageMime(bytes:Uint8Array):string|null{
  if(bytes.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((n,i)=>bytes[i]===n))return 'image/png';
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if(bytes.length>=12&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';return null;
}
export async function uploadAsset(request:Request):Promise<{url:string}>{
  const actor=await requireAccount(request);sameOrigin(request);let account=actor;if(!env.BUCKET)throw new HubError(503,'พื้นที่เก็บรูปยังไม่พร้อม กรุณาลองใหม่');
  const contentType=request.headers.get('content-type')??'';if(!/^multipart\/form-data;\s*boundary=/i.test(contentType))throw new HubError(415,'กรุณาแนบไฟล์รูปภาพ');
  const raw=await boundedBody(request,2*1024*1024+65536);let form:FormData;
  try{form=await new Response(raw.buffer as ArrayBuffer,{headers:{'Content-Type':contentType}}).formData();}catch{throw new HubError(400,'อ่านไฟล์แนบไม่ได้ กรุณาลองใหม่');}
  if(Array.from(form.keys()).some(k=>!['file','pageId'].includes(k))||form.getAll('file').length!==1||form.getAll('pageId').length>1)throw new HubError(400,'แนบรูปภาพครั้งละ 1 ไฟล์');
  const pageId=form.get('pageId');if(pageId!==null){if(typeof pageId!=='string'||!UUID.test(pageId))throw new HubError(400,'ฮับของรูปภาพไม่ถูกต้อง');account=(await pageContext(actor,pageId,'edit')).owner;}
  const file=form.get('file');if(!file||typeof file==='string'||!(file instanceof Blob))throw new HubError(400,'กรุณาแนบรูปภาพ');
  if(file.size===0||file.size>2*1024*1024)throw new HubError(413,'ใช้รูปภาพขนาดไม่เกิน 2 MB');
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=imageMime(bytes);if(!mime||!['image/png','image/jpeg','image/webp'].includes(file.type)||mime!==file.type)throw new HubError(400,'รองรับรูป PNG, JPEG และ WebP เท่านั้น');
  const id=crypto.randomUUID(),key=`hub-assets/${account.id}/${id}`;
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
  try{
    const result=pageId===null
      ?await db().prepare('INSERT INTO hub_assets (id,account_id,page_id,storage_key,mime_type,size,created_at) VALUES (?,?,NULL,?,?,?,?)').bind(id,actor.id,key,mime,bytes.byteLength,Date.now()).run()
      :await db().prepare('INSERT INTO hub_assets (id,account_id,page_id,storage_key,mime_type,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM hub_pages WHERE id=? AND account_id=? AND archived=0 AND '+teamWriteGuard()+')').bind(id,account.id,pageId,key,mime,bytes.byteLength,Date.now(),pageId,account.id,actor.id,actor.id).run();
    if(!result.meta.changes)throw new HubError(403,'สิทธิ์อัปโหลดเปลี่ยนไปแล้ว กรุณาโหลดฮับใหม่');
  }catch(error){try{await env.BUCKET.delete(key);}catch{}throw error;}
  return {url:'/media/'+id};
}
export async function serveAsset(request:Request,id:string):Promise<Response>{
  if(!UUID.test(id))throw new HubError(404,'ไม่พบรูปภาพ');
  const asset=await db().prepare('SELECT * FROM hub_assets WHERE id=?').bind(id).first<AssetRow>();if(!asset||!env.BUCKET)throw new HubError(404,'ไม่พบรูปภาพ');
  const user=identity(request);let allowed=false;
  if(user)allowed=!!await db().prepare('SELECT id FROM hub_accounts WHERE id=? AND user_id=?').bind(asset.account_id,user.userId).first();
  if(!allowed&&user){
    const candidate=await db().prepare(`WITH media AS (SELECT ? AS url,? AS icon)
      SELECT p.id,a.id AS actor_id FROM hub_accounts a
      JOIN hub_team_members m ON m.account_id=a.id JOIN hub_teams t ON t.id=m.team_id
      JOIN hub_team_pages tp ON tp.team_id=t.id JOIN hub_pages p ON p.id=tp.page_id AND p.account_id=t.owner_account_id
      CROSS JOIN media
      WHERE a.user_id=? AND m.status='active' AND t.archived=0 AND p.archived=0 AND p.account_id=?
      AND (p.id=? OR ${DRAFT_MEDIA_REFERENCE} OR ${PUBLISHED_MEDIA_REFERENCE}) LIMIT 1`)
      .bind('/media/'+id,'image:'+id,user.userId,asset.account_id,asset.page_id).first<{id:string;actor_id:string}>();
    if(candidate)allowed=await assetUsable(id,asset.account_id,candidate.id,candidate.actor_id);
  }
  if(!allowed)allowed=!!await db().prepare(`WITH media AS (SELECT ? AS url,? AS icon)
    SELECT p.id FROM hub_pages p CROSS JOIN media WHERE p.account_id=? AND p.published=1 AND p.archived=0
      AND NOT EXISTS(SELECT 1 FROM hub_page_controls c WHERE c.page_id=p.id AND c.suspended=1)
      AND ${PUBLISHED_MEDIA_REFERENCE} LIMIT 1`).bind('/media/'+id,'image:'+id,asset.account_id).first();
  if(!allowed)throw new HubError(404,'ไม่พบรูปภาพ');const object=await env.BUCKET.get(asset.storage_key);if(!object)throw new HubError(404,'ไม่พบรูปภาพ');
  return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':asset.mime_type,'Content-Length':String(object.size),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="image.'+(asset.mime_type==='image/jpeg'?'jpg':asset.mime_type==='image/png'?'png':'webp')+'"'}});
}
export async function requestUpgrade(request:Request):Promise<void>{
  const account=await requireAccount(request);sameOrigin(request);if(account.plan==='pro')throw new HubError(409,'บัญชีของคุณใช้ Pro อยู่แล้ว');
  await db().prepare('INSERT INTO hub_upgrade_requests (account_id,requested_at,resolved_at) VALUES (?,?,NULL) ON CONFLICT(account_id) DO UPDATE SET requested_at=excluded.requested_at,resolved_at=NULL').bind(account.id,Date.now()).run();
}
export async function requireOperator(request:Request):Promise<AccountRow>{const account=await requireAccount(request);if(!await operatorFor(identity(request)!,true))throw new HubError(403,'บัญชีนี้ไม่มีสิทธิ์ดูแลแพลตฟอร์ม');return account;}
export async function getOperator(request:Request):Promise<OperatorData>{
  await requireOperator(request);
  const rows=await db().prepare("SELECT a.*, (SELECT COUNT(*) FROM hub_pages p WHERE p.account_id=a.id AND p.archived=0) AS page_count,(SELECT COUNT(*) FROM hub_events e JOIN hub_pages p ON p.id=e.page_id WHERE p.account_id=a.id AND e.type='click') AS total_clicks,EXISTS(SELECT 1 FROM hub_upgrade_requests u WHERE u.account_id=a.id AND u.resolved_at IS NULL) AS upgrade_requested FROM hub_accounts a ORDER BY upgrade_requested DESC,a.created_at DESC,a.id").all<AccountRow&{page_count:number;total_clicks:number;upgrade_requested:number}>();
  const accounts=rows.results.map(a=>({id:a.id,displayName:a.display_name,email:a.email,plan:a.plan,pageCount:a.page_count,totalClicks:a.total_clicks,upgradeRequested:!!a.upgrade_requested,createdAt:a.created_at}));
  return {accounts,totals:{accounts:accounts.length,pages:accounts.reduce((n,a)=>n+a.pageCount,0),totalClicks:accounts.reduce((n,a)=>n+a.totalClicks,0),upgradeRequests:accounts.filter(a=>a.upgradeRequested).length}};
}
export async function setAccountPlan(request:Request,_id:string):Promise<never>{
  await requireOperator(request);sameOrigin(request);
  throw new HubError(409,'แพ็กเกจอัปเดตจากการชำระเงินผ่าน Stripe เท่านั้น ใช้หลังบ้านเพื่อดูสถานะสมาชิก',{code:'billing_managed_plan'});
}

