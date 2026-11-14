"use client";

import {useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent} from "react";
import {Archive, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Check, CreditCard, ChevronDown, ChevronUp, Copy, ExternalLink, Eye, Globe2, Heading, Image as ImageIcon, LayoutGrid, Link2, LoaderCircle, LockKeyhole, LogOut, MessageCircle, MoreHorizontal, Palette, Package, BadgePercent, PencilLine, Plus, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, Sparkles, Upload, Users, X} from "lucide-react";
import type {HubContentType, HubLink, HubProfile, HubTemplate, PageEditorData, PageSummary, WorkspaceData} from "../../lib/hub-types";
import {hasBlockAction, isRichContentType} from "../../lib/hub-content";
import {reorderProductIds} from "../../lib/hub-product-order";
import {formatThaiBaht,getPromotionPricing} from "../../lib/hub-promotion";
import {CONTENT_OPTIONS, ContentFields, ContentTypePicker, HubShareSettings, contentDraftOf, contentDraftError, emptyContent, type ContentDraft} from "./HubContentEditor";
import {HubBrand} from "./ui";
import {BuildVersion} from "./BuildVersion";
import {HubCanvas} from "./HubCanvas";
import HubThemeGallery from "./HubThemeGallery";
import {HubLinkIcon} from "./HubLinkIcon";
import LinkMediaPicker from "./LinkMediaPicker";
import HubAnalytics from "./HubAnalytics";
import HubAnalyticsUpgrade from "./HubAnalyticsUpgrade";
import HubBilling from "./HubBilling";
import HubTooltips from "./HubTooltips";
import LineNotifications from "./LineNotifications";
import HubTeams from "./HubTeams";
import HubInvitation from "./HubInvitation";
import "../studio.css";

type Screen="pages"|"create"|"editor"|"account"|"billing"|"teams"|"invite";
type EditorTab="content"|"appearance"|"analytics";
type ApiError=Error&{status?:number;signInUrl?:string;provider?:string;code?:string};
type AuthConfig={provider:"line"|"access"|"none";configured:boolean;signInUrl:string|null;signOutUrl:string;signOutMethod:"POST"|"GET";message?:string};
const AUTH_MESSAGES:Record<string,string>={line_not_configured:"การเข้าสู่ระบบด้วย LINE ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง",line_denied:"คุณยกเลิกการเข้าสู่ระบบ ลองอีกครั้งได้เมื่อพร้อม",line_state_invalid:"คำขอเข้าสู่ระบบหมดอายุหรือไม่สมบูรณ์ กรุณาเริ่มเข้าสู่ระบบใหม่",line_unavailable:"ยังเชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองอีกครั้ง",line_invalid_identity:"ยืนยันบัญชี LINE ไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่",line_origin_invalid:"ยังเปิดการเข้าสู่ระบบจากที่อยู่นี้ไม่ได้ กรุณาติดต่อผู้ดูแล"};
function localAuthPath(value:string|null|undefined){return value?.startsWith("/")&&!value.startsWith("//")&&!value.includes("\\")?value:null;}
type LinkDraft=ContentDraft;
const count=new Intl.NumberFormat("th-TH");
const TEMPLATES:{id:HubTemplate;name:string;description:string;layout:string;accent:string}[]=[{id:"creator",name:"ครีเอเตอร์",description:"ผลงาน เรื่องราว และช่องทางติดตาม",layout:"stack",accent:"#04878a"},{id:"business",name:"ธุรกิจและบริการ",description:"แนะนำแบรนด์ พร้อมช่องทางติดต่อ",layout:"editorial",accent:"#376248"},{id:"shop",name:"ร้านค้า",description:"จัดสินค้าและช่องทางสั่งซื้อเป็นหมวด",layout:"grid",accent:"#a66543"}];
const BACKGROUNDS:{id:HubProfile["background"];name:string;color:string}[]=[{id:"mint",name:"Mint",color:"#e8f3ee"},{id:"sand",name:"Sand",color:"#f6eee2"},{id:"lavender",name:"Lavender",color:"#eeebf5"},{id:"ink",name:"Ink",color:"#223533"}];

async function api<T>(url:string,init?:RequestInit):Promise<T>{let response:Response;try{response=await fetch(url,{...init,cache:"no-store",headers:{...(init?.body&&!(init.body instanceof FormData)?{"Content-Type":"application/json"}:{}),...init?.headers}});}catch{throw new Error("เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง");}let body:any;try{body=await response.json();}catch{throw new Error("เซิร์ฟเวอร์ตอบกลับไม่สมบูรณ์ กรุณาลองใหม่");}if(!response.ok){const e:ApiError=new Error(typeof body.error==="string"?body.error:"ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง");e.status=response.status;e.signInUrl=body.signInUrl;e.provider=body.provider;e.code=body.code;throw e;}return body as T;}
function draftOf(link:HubLink):LinkDraft{return contentDraftOf(link);}
function dateLabel(n:number){return new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",timeZone:"Asia/Bangkok"}).format(new Date(n));}
function pageStatus(page:PageSummary){return page.suspended?"พักโดยผู้ดูแล":!page.published?"ฉบับร่าง":page.hasUnpublishedChanges?"มีร่างใหม่":"เผยแพร่แล้ว";}

export default function HubStudio(){
  const [workspace,setWorkspace]=useState<WorkspaceData|null>(null);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState<ApiError|null>(null);
  const [authConfig,setAuthConfig]=useState<AuthConfig|null>(null);
  const [authNotice,setAuthNotice]=useState("");
  const [screen,setScreen]=useState<Screen>("pages");
  const [inviteToken,setInviteToken]=useState("");
  const [teamPageId,setTeamPageId]=useState<string|undefined>();
  const [conflict,setConflict]=useState(false);
  const [editor,setEditor]=useState<PageEditorData|null>(null);
  const [editorTab,setEditorTab]=useState<EditorTab>("content");
  const [analyticsIntent,setAnalyticsIntent]=useState(false);
  const [analyticsLinkId,setAnalyticsLinkId]=useState<string|undefined>();
  const [linkDrafts,setLinkDrafts]=useState<Record<string,LinkDraft>>({});
  const [profile,setProfile]=useState<HubProfile|null>(null);
  const [slug,setSlug]=useState("");
  const [dirtyRows,setDirtyRows]=useState<Record<string,boolean>>({});
  const [saveEpoch,setSaveEpoch]=useState(0);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [toast,setToast]=useState("");
  const [origin,setOrigin]=useState("");
  const [preview,setPreview]=useState(false);
  const [pageQuery,setPageQuery]=useState("");
  const [pageFilter,setPageFilter]=useState<"all"|"published"|"draft"|"suspended">("all");
  const [archivePage,setArchivePage]=useState<string|null>(null);
  const [openCardMenu,setOpenCardMenu]=useState<string|null>(null);
  const [unpublishConfirm,setUnpublishConfirm]=useState(false);
  const [name,setName]=useState("");
  const [newSlug,setNewSlug]=useState("");
  const [template,setTemplate]=useState<HubTemplate>("creator");
  const [newBlockType,setNewBlockType]=useState<HubContentType|null>(null);
  const [newBlockAfterId,setNewBlockAfterId]=useState<string|null>(null);
  const [newBlockDraft,setNewBlockDraft]=useState<ContentDraft>(()=>emptyContent("link"));
  const [contentPicker,setContentPicker]=useState(false);
  const [slugCheck,setSlugCheck]=useState<{status:"idle"|"checking"|"available"|"taken"|"error";message:string}>({status:"idle",message:""});
  const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const uploadRef=useRef<HTMLInputElement>(null);
  const initialPageHandled=useRef(false);
  const profileDirtyRef=useRef(false);
  const previewOverlayRef=useRef<HTMLElement|null>(null);
  const previewCloseRef=useRef<HTMLButtonElement|null>(null);
  const notify=useCallback((message:string)=>{setToast(message);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(""),4000);},[]);
  const refreshWorkspace=useCallback(async()=>{const result=await api<WorkspaceData>("/api/workspace");setWorkspace(result);return result;},[]);
  const load=useCallback(async()=>{
    setLoading(true);setLoadError(null);
    const [workspaceResult,configResult]=await Promise.allSettled([refreshWorkspace(),api<AuthConfig>("/api/auth/config")]);
    if(configResult.status==="fulfilled")setAuthConfig(configResult.value);else setAuthConfig(null);
    if(workspaceResult.status==="rejected")setLoadError(workspaceResult.reason as ApiError);
    setLoading(false);
  },[refreshWorkspace]);
  useEffect(()=>{setOrigin(window.location.origin);const invitation=new URLSearchParams(window.location.search).get("invite");if(invitation&&/^[A-Za-z0-9_-]{43}$/.test(invitation))setInviteToken(invitation);const authError=new URLSearchParams(window.location.search).get("auth_error");setAuthNotice(authError?AUTH_MESSAGES[authError]||"ยังเข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง":"");void load();return()=>{if(toastTimer.current)clearTimeout(toastTimer.current);};},[load]);
  useEffect(()=>{if(screen!=="create"||!newSlug){setSlugCheck({status:"idle",message:""});return;}if(!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(newSlug)||newSlug.includes("--")){setSlugCheck({status:"taken",message:"ใช้ตัวอักษรอังกฤษตัวเล็ก ตัวเลข หรือขีดกลาง 3–40 ตัว และไม่ใช้ขีดกลางติดกัน"});return;}let cancelled=false;setSlugCheck({status:"checking",message:"กำลังตรวจชื่อ URL"});const timer=setTimeout(()=>void api<{available:boolean;reason?:string}>(`/api/slugs?slug=${encodeURIComponent(newSlug)}`).then(result=>{if(!cancelled)setSlugCheck({status:result.available?"available":"taken",message:result.available?"ชื่อนี้ใช้ได้":result.reason||"ชื่อนี้ถูกใช้แล้ว ลองชื่ออื่นได้เลย"});}).catch(()=>{if(!cancelled)setSlugCheck({status:"error",message:"ตรวจชื่อไม่ได้ตอนนี้ ระบบจะตรวจอีกครั้งเมื่อสร้าง"});}),450);return()=>{cancelled=true;clearTimeout(timer);};},[newSlug,screen]);
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"auto"});},[screen,editor?.page.id]);
  useEffect(()=>{
    if(!preview)return;
    const mobile=window.matchMedia("(max-width: 780px)");
    if(!mobile.matches){setPreview(false);return;}
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    previewCloseRef.current?.focus({preventScroll:true});
    function onKeyDown(event:KeyboardEvent){
      if(previewOverlayRef.current?.querySelector("dialog[open]"))return;
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setPreview(false);return;}
      if(event.key!=="Tab")return;
      const overlay=previewOverlayRef.current;
      if(!overlay)return;
      const focusable=Array.from(overlay.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length>0&&!element.hasAttribute("hidden"));
      const first=focusable[0],last=focusable[focusable.length-1];
      if(!first){event.preventDefault();overlay.focus();return;}
      if(!overlay.contains(document.activeElement)||document.activeElement===overlay){event.preventDefault();(event.shiftKey?last:first).focus();return;}
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    const onWidthChange=()=>{if(!mobile.matches)setPreview(false);};
    document.addEventListener("keydown",onKeyDown,true);
    mobile.addEventListener("change",onWidthChange);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener("keydown",onKeyDown,true);mobile.removeEventListener("change",onWidthChange);if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});};
  },[preview]);
  const links=(editor?.links||[]).filter(link=>!link.archived).sort((a,b)=>a.sortOrder-b.sortOrder);
  const productLinks=links.filter(link=>link.type==='service'||link.type==='promotion');
  const archivedLinks=(editor?.links||[]).filter(link=>link.archived);
  const previewLinks:HubLink[]=links.map(link=>linkDrafts[link.id]?{...link,...linkDrafts[link.id]}:link);
  if(newBlockType&&newBlockDraft.title.trim())previewLinks.push({...newBlockDraft,id:"new-link-preview",sortOrder:Math.max(-1,...links.map(link=>link.sortOrder))+1,archived:false});
  const unsavedRows=Object.values(dirtyRows).some(Boolean);
  const unsavedCount=Object.keys(linkDrafts).length;
  const profileDirty=!!(editor&&profile&&(JSON.stringify(profile)!==JSON.stringify(editor.profile)||slug!==editor.page.slug));
  const hasUnsaved=unsavedRows||profileDirty||busy==="link-image-upload"||!!(newBlockType&&JSON.stringify(newBlockDraft)!==JSON.stringify(emptyContent(newBlockType)));
  profileDirtyRef.current=profileDirty;
  useEffect(()=>{if(!hasUnsaved)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[hasUnsaved]);
  useEffect(()=>{if(!workspace||initialPageHandled.current)return;initialPageHandled.current=true;const params=new URLSearchParams(window.location.search);if(params.get("invite")&&/^[A-Za-z0-9_-]{43}$/.test(params.get("invite")!)){setScreen("invite");return;}if(params.get("section")==="teams"){setScreen("teams");return;}if(params.get("section")==="billing"||["plans","success","cancelled","portal"].includes(params.get("billing")||"")){setScreen("billing");return;}if(params.get("section")==="account")setScreen("account");const requested=params.get("page");const wantsAnalytics=params.get("view")==="analytics";const available=[...workspace.pages,...(workspace.sharedPages||[])];if(!requested){if(wantsAnalytics){setAnalyticsIntent(true);if(available.length===1)void openEditor(available[0].id,"analytics");else if(!available.length)setError("ยังไม่มีฮับสำหรับดูสถิติ กรุณาสร้างฮับก่อน");}return;}if(available.some(page=>page.id===requested)){void openEditor(requested,wantsAnalytics?"analytics":"content");}else{setError("ไม่พบฮับนี้ในบัญชีของคุณ หรือฮับถูกเก็บเข้าคลังแล้ว");}},[workspace]);
  const markDirty=useCallback((id:string,dirty:boolean)=>setDirtyRows(previous=>previous[id]===dirty?previous:{...previous,[id]:dirty}),[]);
  const markDraft=useCallback((id:string,draft:LinkDraft|null)=>setLinkDrafts(previous=>{if(draft){if(JSON.stringify(previous[id])===JSON.stringify(draft))return previous;return {...previous,[id]:draft};}if(!(id in previous))return previous;const next={...previous};delete next[id];return next;}),[]);
  const setMediaUploading=useCallback((uploading:boolean)=>setBusy(uploading?"link-image-upload":null),[]);
  function adoptEditor(value:PageEditorData,preserveUnsaved=false){setEditor(value);if(!preserveUnsaved||!profileDirtyRef.current){setProfile(value.profile);setSlug(value.page.slug);}setUnpublishConfirm(false);}
  async function reloadEditor(){if(!editor)return;const result=await api<PageEditorData>(`/api/pages/${editor.page.id}`);adoptEditor(result,true);return result;}
  function navigate(next:Screen){if(busy)return;if(screen==="editor"&&hasUnsaved){setError("มีข้อมูลที่ยังไม่ได้บันทึก กรุณาบันทึกหรือยกเลิกการแก้ไขก่อนเปลี่ยนหน้า");return;}setScreen(next);setError("");setConflict(false);setArchivePage(null);setPreview(false);if(next!=="editor")window.history.replaceState(window.history.state,"",next==="account"?"/studio?section=account":next==="billing"?"/studio?section=billing":next==="teams"?"/studio?section=teams":"/studio");if(next==="pages")void refreshWorkspace().catch(e=>setError((e as Error).message));}
  function switchEditorTab(next:EditorTab){if(busy)return;if(hasUnsaved){setError("มีข้อมูลที่ยังไม่ได้บันทึก กรุณาบันทึกหรือยกเลิกการแก้ไขก่อนเปลี่ยนแท็บ");return;}setAnalyticsLinkId(undefined);setEditorTab(next);setError("");setPreview(false);}
  function showLinkStatistics(id:string){if(busy)return;if(hasUnsaved){setError("บันทึกหรือยกเลิกการแก้ไขก่อนเปิดสถิติของลิงก์");return;}setAnalyticsLinkId(id);setEditorTab("analytics");setError("");setPreview(false);}
  async function openEditor(id:string,nextTab:EditorTab="content"){if(busy)return;setBusy("open-"+id);setError("");try{const value=await api<PageEditorData>(`/api/pages/${id}`);adoptEditor(value);setDirtyRows({});setLinkDrafts({});setAnalyticsLinkId(undefined);setNewBlockAfterId(null);setNewBlockType(null);setContentPicker(false);setNewBlockDraft(emptyContent("link"));setEditorTab(value.access?.canEdit===false||analyticsIntent?"analytics":nextTab);setAnalyticsIntent(false);setConflict(false);setScreen("editor");window.history.replaceState(window.history.state,"",`/studio?page=${encodeURIComponent(id)}`);}catch(e){mutationError(e);}finally{setBusy(null);}}
  function startCreate(){if(workspace&&workspace.usage.pages>=workspace.limits.maxPages){setScreen("billing");window.history.replaceState(window.history.state,"","/studio?section=billing");setError("แพ็กเกจปัจจุบันใช้จำนวนฮับครบแล้ว ดูตัวเลือกแพ็กเกจได้ที่นี่");return;}setName("");setNewSlug("");setTemplate("creator");setScreen("create");setError("");}
  async function createPage(event:FormEvent){event.preventDefault();if(busy)return;setBusy("create");setError("");try{const value=await api<PageEditorData>("/api/pages",{method:"POST",body:JSON.stringify({name:name.trim(),slug:newSlug.trim(),template})});adoptEditor(value);setDirtyRows({});setNewBlockType(null);setEditorTab("content");setScreen("editor");window.history.replaceState(window.history.state,"",`/studio?page=${encodeURIComponent(value.page.id)}`);await refreshWorkspace();notify("สร้างฮับแล้ว เพิ่มเนื้อหาของคุณได้เลย");}catch(e){mutationError(e);}finally{setBusy(null);}}
  function manageTeam(){if(!editor)return;setTeamPageId(editor.page.id);navigate("teams");}
  function mutationError(e:unknown){setError((e as Error).message);if((e as ApiError).status===409)setConflict(true);}
  function addContent(type:HubContentType){setNewBlockAfterId(type==="service"||type==="promotion"?productLinks[0]?.id??null:null);setNewBlockType(type);setNewBlockDraft(emptyContent(type));setContentPicker(false);setError("");}
  function addProductAfter(id:string){if(busy||newBlockType)return;setNewBlockAfterId(id);setNewBlockType("service");setNewBlockDraft(emptyContent("service"));setContentPicker(false);setError("");}
  function addPromotionAfter(id:string){if(busy||newBlockType)return;setNewBlockAfterId(id);setNewBlockType("promotion");setNewBlockDraft(emptyContent("promotion"));setContentPicker(false);setError("");}
  function cancelNewContent(){setNewBlockAfterId(null);setNewBlockType(null);setNewBlockDraft(emptyContent("link"));setError("");}
  async function createBlock(event:FormEvent){
    event.preventDefault();
    if(!editor||busy||!newBlockType)return;
    const validation=contentDraftError(newBlockDraft);
    if(validation){setError(validation);return;}
    setBusy("add");setError("");
    try{
      const created=await api<{link:HubLink}>(`/api/pages/${editor.page.id}/links`,{
        method:"POST",
        body:JSON.stringify({...newBlockDraft,title:newBlockDraft.title.trim(),url:newBlockDraft.url.trim(),revision:editor.revision})
      });
      await reloadEditor();
      setNewBlockAfterId(null);setNewBlockType(null);setNewBlockDraft(emptyContent("link"));
      await refreshWorkspace();
      notify(created.link.type==="promotion"||created.link.type==="service"?"เพิ่มสินค้าในกลุ่มเรียบร้อยแล้ว":"เพิ่มเนื้อหาในฉบับร่างแล้ว");
      if(created.link.type==="service"||created.link.type==="promotion"){
        window.requestAnimationFrame(()=>{
          const row=document.getElementById(`studio-link-${created.link.id}`);
          if(row)row.scrollIntoView({block:"center",behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?"auto":"smooth"});
        });
      }
    }catch(e){mutationError(e);}finally{setBusy(null);}
  }
  async function duplicateBlock(link:HubLink){if(!editor||busy)return;if(hasUnsaved){setError("บันทึกหรือยกเลิกการแก้ไขก่อนทำสำเนา");return;}setBusy("duplicate");setError("");try{await api<{link:HubLink}>(`/api/pages/${editor.page.id}/links`,{method:"POST",body:JSON.stringify({...draftOf(link),title:(link.title+" (สำเนา)").slice(0,100),enabled:false,revision:editor.revision})});await reloadEditor();await refreshWorkspace();notify("ทำสำเนาแล้ว รายการใหม่ยังซ่อนอยู่จนกว่าคุณจะเปิดใช้งาน");}catch(e){mutationError(e);}finally{setBusy(null);}}
  function discardLinkEdits(){
    setSaveEpoch(value=>value+1);
    setDirtyRows({});setLinkDrafts({});setError("");
  }
  async function saveAllLinks(){
    if(!editor||busy)return;
    const changes=links.filter(link=>!!linkDrafts[link.id]).map(link=>({id:link.id,draft:linkDrafts[link.id]}));
    if(!changes.length)return;
    for(const {id,draft} of changes){
      const validation=contentDraftError(draft);
      if(validation){
        setError(`กรุณาตรวจสอบ "${links.find(link=>link.id===id)?.title||'รายการ'}": ${validation}`);
        document.getElementById(`studio-link-${id}`)?.scrollIntoView({block:"center",behavior:"smooth"});
        return;
      }
    }
    setBusy("save-all");setError("");
    try{
      const saved=await api<PageEditorData>(`/api/pages/${editor.page.id}/links/batch`,{
        method:"PATCH",
        body:JSON.stringify({revision:editor.revision,
          links:changes.map(({id,draft})=>({id,...draft,title:draft.title.trim(),url:draft.url.trim()}))})
      });
      setSaveEpoch(value=>value+1);
      setDirtyRows({});setLinkDrafts({});
      adoptEditor(saved);
      await refreshWorkspace().catch(()=>{});
      notify(`บันทึกเรียบร้อย ${changes.length} รายการ · กดเผยแพร่เมื่อพร้อมให้ลูกค้าเห็น`);
    }catch(e){mutationError(e);}finally{setBusy(null);}
  }
  async function patchLink(link:HubLink,patch:Partial<HubLink>){if(!editor||busy)return;if(unsavedRows){setError("กรุณากดบันทึกการแก้ไขก่อนดำเนินการอื่น");return;}setBusy(link.id);setError("");try{await api(`/api/pages/${editor.page.id}/links/${link.id}`,{method:"PATCH",body:JSON.stringify({...patch,revision:editor.revision})});await reloadEditor();notify(patch.archived===false?"กู้คืนแล้ว ลิงก์ยังซ่อนอยู่จนกว่าจะเปิดใช้งาน":"บันทึกฉบับร่างแล้ว");}catch(e){mutationError(e);}finally{setBusy(null);}}
  async function archiveLink(link:HubLink){if(!editor||busy)return;if(unsavedRows){setError("กรุณากดบันทึกการแก้ไขก่อนเก็บรายการเข้าคลัง");return;}setBusy(link.id);setError("");try{await api(`/api/pages/${editor.page.id}/links/${link.id}?revision=${editor.revision}`,{method:"DELETE"});markDirty(link.id,false);await reloadEditor();await refreshWorkspace();notify("เก็บเข้าคลังแล้ว ประวัติคลิกยังอยู่");}catch(e){mutationError(e);}finally{setBusy(null);}}
  async function reorder(index:number,direction:number){if(!editor||busy)return;if(unsavedRows){setError("กรุณากดบันทึกการแก้ไขก่อนเปลี่ยนลำดับ");return;}const ordered=[...links],target=index+direction;if(target<0||target>=ordered.length)return;[ordered[index],ordered[target]]=[ordered[target],ordered[index]];setBusy("reorder");setError("");try{await api(`/api/pages/${editor.page.id}/reorder`,{method:"POST",body:JSON.stringify({ids:ordered.map(link=>link.id),revision:editor.revision})});await reloadEditor();notify("บันทึกลำดับในฉบับร่างแล้ว");}catch(e){mutationError(e);}finally{setBusy(null);}}
  async function reorderProduct(index:number,direction:number){
    if(!editor||busy)return;
    if(unsavedRows){setError("กรุณากดบันทึกการแก้ไขก่อนเปลี่ยนลำดับ");return;}
    const ids=reorderProductIds(links,index,direction);
    if(!ids)return;
    setBusy("reorder");setError("");
    try{
      await api(`/api/pages/${editor.page.id}/reorder`,{method:"POST",body:JSON.stringify({ids,revision:editor.revision})});
      await reloadEditor();
      notify("เปลี่ยนลำดับสินค้าในฉบับร่างแล้ว");
    }catch(e){mutationError(e);}finally{setBusy(null);}
  }
  async function saveProfile(event:FormEvent){event.preventDefault();if(!editor||!profile||busy)return;setBusy("profile");setError("");try{const result=await api<PageEditorData>(`/api/pages/${editor.page.id}`,{method:"PATCH",body:JSON.stringify({profile,...(slug!==editor.page.slug?{slug}:{}),revision:editor.revision})});adoptEditor(result);await refreshWorkspace();notify("บันทึกหน้าตาในฉบับร่างแล้ว");}catch(e){mutationError(e);}finally{setBusy(null);}}
  async function setAvatar(url:string){if(!editor)return;const result=await api<PageEditorData>(`/api/pages/${editor.page.id}`,{method:"PATCH",body:JSON.stringify({profile:{avatarUrl:url},revision:editor.revision})});setEditor(result);setProfile(previous=>previous?{...previous,avatarUrl:url}:result.profile);notify(url?"บันทึกรูปในฉบับร่างแล้ว":"นำรูปออกจากฉบับร่างแล้ว");}
  async function uploadAvatar(file?:File){if(!file||!editor||busy)return;if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>2*1024*1024){setError("เลือกรูป PNG, JPG หรือ WebP ขนาดไม่เกิน 2 MB");return;}setBusy("avatar");setError("");try{const form=new FormData();form.append("file",file);form.append("pageId",editor.page.id);const result=await api<{url:string}>("/api/uploads",{method:"POST",body:form});await setAvatar(result.url);}catch(e){mutationError(e);}finally{setBusy(null);if(uploadRef.current)uploadRef.current.value="";}}
  async function removeAvatar(){if(!editor||busy)return;setBusy("avatar");setError("");try{await setAvatar("");}catch(e){mutationError(e);}finally{setBusy(null);}}
  async function publish(){if(!editor||busy||hasUnsaved||editor.page.suspended)return;setBusy("publish");setError("");try{const result=await api<PageEditorData>(`/api/pages/${editor.page.id}/publish`,{method:"POST",body:JSON.stringify({revision:editor.revision})});adoptEditor(result);await refreshWorkspace();notify("เผยแพร่ฮับแล้ว ลิงก์ของคุณพร้อมใช้งาน");}catch(e){mutationError(e);}finally{setBusy(null);}}
  async function unpublish(){if(!editor||busy)return;setBusy("unpublish");setError("");try{const result=await api<PageEditorData>(`/api/pages/${editor.page.id}/unpublish`,{method:"POST",body:JSON.stringify({revision:editor.revision})});adoptEditor(result);await refreshWorkspace();notify("หยุดเผยแพร่ฮับแล้ว ข้อมูลยังอยู่ครบ");}catch(e){mutationError(e);}finally{setBusy(null);}}
  async function deletePage(page:PageSummary){if(busy)return;setBusy(page.id);setError("");try{await api(`/api/pages/${page.id}`,{method:"DELETE"});await refreshWorkspace();setArchivePage(null);notify("เก็บฮับเข้าคลังแล้ว");}catch(e){mutationError(e);}finally{setBusy(null);}}
  async function restorePage(page:PageSummary){if(busy)return;setBusy(page.id);setError("");try{await api<PageEditorData>(`/api/pages/${page.id}`,{method:"PATCH",body:JSON.stringify({archived:false})});await refreshWorkspace();notify("กู้คืนฮับแล้ว ตรวจสอบฉบับร่างก่อนเผยแพร่");}catch(e){mutationError(e);}finally{setBusy(null);}}
  async function copyPage(page:PageSummary){try{await navigator.clipboard.writeText(`${window.location.origin}/h/${page.slug}`);notify("คัดลอกลิงก์ฮับแล้ว");}catch{setError("คัดลอกอัตโนมัติไม่ได้ เปิดฮับแล้วคัดลอกจากแถบที่อยู่ได้เลย");}}

  async function signOut(){
    if(busy)return;
    const path=localAuthPath(authConfig?.signOutUrl);
    if(!path){setError("ยังออกจากระบบไม่ได้ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง");return;}
    if(authConfig?.signOutMethod==="GET"){window.location.assign(path);return;}
    setBusy("logout");setError("");
    try{const result=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"});if(!result.ok)throw new Error("ยังออกจากระบบไม่ได้ กรุณาลองอีกครั้ง");window.location.assign("/");}catch(e){mutationError(e);setBusy(null);}
  }

  if(loading)return <div className="hs-auth"><HubBrand/><div className="hs-auth-card"><LoaderCircle className="hs-spin" size={29}/><h1>กำลังเปิดสตูดิโอของคุณ</h1><p>เตรียมพื้นที่สำหรับทุกลิงก์ของคุณ</p></div></div>;
  if(loadError||!workspace){
    const baseSignIn=authConfig?.configured?localAuthPath(authConfig.signInUrl):null;
    const signInUrl=baseSignIn&&authConfig?.provider==="line"&&inviteToken?`/auth/line/start?returnTo=${encodeURIComponent(`/studio?invite=${inviteToken}`)}`:baseSignIn;
    const isLoginError=loadError?.status===401||loadError?.code==="auth_not_configured";
    return <div className="hs-auth"><a href="/"><HubBrand/></a><div className="hs-auth-card"><span className="hs-auth-symbol">{authConfig?.provider==="line"?<MessageCircle size={27}/>:<LockKeyhole size={27}/>}</span><p className="hs-kicker">YOUR SPACE TO CONNECT</p><h1>{signInUrl&&isLoginError?(inviteToken?"เข้าสู่ระบบเพื่อตอบรับคำเชิญ":"พื้นที่ของคุณ เริ่มตรงนี้"):isLoginError?"สตูดิโอกำลังเตรียมพร้อม":"ยังเปิดสตูดิโอไม่ได้"}</h1><p>{signInUrl&&isLoginError?(inviteToken?"ใช้บัญชี LINE ของคุณเพื่อตรวจคำเชิญและเข้าร่วมทีม":"เข้าสู่ระบบเพื่อสร้างฮับ จัดการลิงก์ และดูสถิติในบัญชีของคุณ"):isLoginError&&authConfig&&!authConfig.configured?"พื้นที่สำหรับจัดการลิงก์และดูสถิติของคุณ":loadError?.message||"กรุณาลองอีกครั้ง"}</p>{authNotice&&<p className="hs-auth-notice" role="alert">{authNotice}</p>}{signInUrl&&isLoginError?<><a className={authConfig?.provider==="line"?"hs-line-login":"hs-button hs-primary"} href={signInUrl} target="_top">{authConfig?.provider==="line"&&<MessageCircle size={21}/>}เข้าสู่ระบบ{authConfig?.provider==="line"?"ด้วย LINE":""}<ArrowUpRight size={17}/></a>{authConfig?.provider==="line"&&<p className="hs-auth-line-note">ใช้บัญชี LINE ของคุณได้เลย<br/>เลือกรับสรุปยอดผ่าน LINE ได้ภายหลังในตั้งค่าบัญชี</p>}</>:<>{authConfig&&!authConfig.configured&&<div className="hs-auth-setup"><ShieldCheck size={21}/><p>{authConfig.message||"ผู้ดูแลกำลังเชื่อมต่อระบบเข้าสู่ระบบ กรุณากลับมาลองอีกครั้ง"}</p></div>}<button type="button" className="hs-auth-retry" onClick={()=>void load()}><RefreshCw size={15}/>ลองอีกครั้ง</button></>}<a className="hs-text-link" href="/">กลับไปหน้าแรก</a></div></div>;
  }
  const atLimit=workspace.usage.pages>=workspace.limits.maxPages;
  const publishedPages=workspace.pages.filter(page=>page.published&&!page.suspended);
  const shownPages=workspace.pages.filter(page=>(pageFilter==="all"||(pageFilter==="published"?page.published&&!page.suspended:pageFilter==="suspended"?page.suspended:!page.published&&!page.suspended))&&`${page.title} ${page.slug}`.toLowerCase().includes(pageQuery.trim().toLowerCase()));
  const pageUrl=editor?`${origin}/h/${editor.page.slug}`:"";
  const editorCanEdit=editor?.access?.canEdit??true;
  const editorCanManage=editor?.access?.canManage??true;
  const editorCanPublish=editor?.access?.canPublish??true;
  const editorAnalytics=editor?.access?.analytics??workspace.account.entitlements.analytics;
  const editorPlan=editor?.access?.plan??workspace.account.plan;
  const editorLimit=editorPlan==="pro"?100:5;
  return <div className="hs-shell"><HubTooltips/><a href="#studio-main" className="hs-skip">ข้ามไปเนื้อหา</a>
    <aside className="hs-sidebar">
      <a href="/" className="hs-brand-link" aria-label="นากนะ HUB หน้าแรก"><HubBrand/></a>
      <button type="button" className="hs-workspace-label" aria-label={`${workspace.account.displayName}: บัญชีและการเชื่อมต่อ`} onClick={()=>navigate("account")} data-tooltip="ดูการตั้งค่าบัญชีและการเชื่อมต่อ"><span>{workspace.account.displayName.slice(0,1)||"N"}</span><div><strong>{workspace.account.displayName}</strong><small>{workspace.account.plan==="pro"?"แพ็กเกจ Pro":"แพ็กเกจ Starter"}</small></div><ChevronDown size={16}/></button>
      <span className="hs-nav-caption">พื้นที่ทำงาน</span>
      <nav aria-label="สตูดิโอ">
        <button aria-current={["pages","create","editor"].includes(screen)?"page":undefined} className={["pages","create","editor"].includes(screen)?"active":""} onClick={()=>navigate("pages")}><LayoutGrid size={20}/><span>ฮับของฉัน</span><b>{workspace.usage.pages}</b></button>
        <button aria-current={screen==="teams"?"page":undefined} className={screen==="teams"?"active":""} onClick={()=>navigate("teams")} aria-label="ทีมและผู้ร่วมงาน" data-tooltip="เพิ่มทีม เชิญสมาชิก และจัดการสิทธิ์ร่วมแก้ไขฮับ"><Users size={20}/><span>ทีม<span className="ht-nav-tail">และผู้ร่วมงาน</span></span></button>
        <button aria-current={screen==="account"?"page":undefined} className={screen==="account"?"active":""} onClick={()=>navigate("account")}><Settings2 size={20}/><span>บัญชี<span className="hs-nav-tail">และการเชื่อมต่อ</span></span></button>
        <button aria-current={screen==="billing"?"page":undefined} className={screen==="billing"?"active":""} onClick={()=>navigate("billing")} aria-label="แพ็กเกจและการชำระเงิน" data-tooltip="ดูราคา อัปเกรด Pro และจัดการสมาชิก"><CreditCard size={20}/><span>แพ็กเกจ<span className="hb-nav-tail">และการชำระเงิน</span></span></button>
      </nav>
      <div className="hs-sidebar-bottom"><div className="hs-sidebar-plan"><div className="hs-usage-label"><span>ฮับที่ใช้งาน</span><strong>{workspace.usage.pages} / {workspace.limits.maxPages}</strong></div><div className="hs-usage-bar"><i style={{width:`${Math.min(100,workspace.usage.pages/workspace.limits.maxPages*100)}%`}}/></div><p>{workspace.account.plan==="pro"?"พื้นที่สำหรับทุกแบรนด์ของคุณ":"ดูสถิติ รับสรุป LINE และซ่อนแบรนด์ด้วย Pro"}</p><button onClick={()=>navigate("billing")} data-tooltip="เปรียบเทียบ Starter กับ Pro และจัดการสมาชิก">{workspace.account.plan==="pro"?"จัดการแพ็กเกจ":"ดูแพ็กเกจ Pro"}<ArrowUpRight size={16}/></button></div><span className="hs-sidebar-signature">ทุกลิงก์ มีที่ของมัน</span><BuildVersion/></div>
    </aside>
    <div className="hs-main-area"><header className="hs-topbar"><div className="hs-breadcrumb"><button onClick={()=>navigate("pages")}>สตูดิโอ</button><span>/</span><strong>{screen==="editor"?editor?.profile.name:screen==="account"?"บัญชีและการเชื่อมต่อ":screen==="billing"?"แพ็กเกจและการชำระเงิน":screen==="create"?"สร้างฮับใหม่":screen==="teams"?"ทีมและผู้ร่วมงาน":screen==="invite"?"คำเชิญร่วมทีม":"ฮับของฉัน"}</strong></div><button className="hs-account-pill" onClick={()=>navigate("account")} aria-label="เปิดการตั้งค่าบัญชี"><span className={`hs-plan hs-plan-${workspace.account.plan}`}>{workspace.account.plan==="pro"?"PRO":"STARTER"}</span><span className="hs-account-initial">{workspace.account.displayName.slice(0,1)||"N"}</span></button></header>
    <main id="studio-main" tabIndex={-1} className={`hs-main ${screen==="pages"?"hs-home-main":""} ${screen==="editor"?`hs-editor-main ${editorTab==="analytics"?"hs-editor-view-analytics":""}`:""}`}>
      {error&&<div className="hs-error" role="alert"><span>{error}{conflict&&editor&&<span className="ht-conflict-actions">สิ่งที่กำลังแก้ยังอยู่ในหน้านี้ <a href={`/studio?page=${editor.page.id}`} target="_blank" rel="noopener">เปิดเวอร์ชันล่าสุดในแท็บใหม่ <ArrowUpRight size={14}/></a></span>}</span><button aria-label="ปิดข้อความ" onClick={()=>setError("")}><X size={17}/></button></div>}
      {screen==="pages"&&<>
        <div className="hs-page-heading"><div><p className="hs-kicker">พื้นที่ของ {workspace.account.displayName}</p><h1>{analyticsIntent?"เลือกฮับเพื่อดูสถิติ":"ฮับของฉัน"}<span className="hs-heading-dot">.</span></h1><p>{analyticsIntent?"เลือกฮับที่ต้องการดูยอดเข้าชมและยอดคลิก":"จัดการทุกฮับและลิงก์ของคุณในที่เดียว"}</p></div><button className={`hs-button ${atLimit?"hs-outline":"hs-primary"}`} onClick={startCreate} data-tooltip={atLimit?"แพ็กเกจนี้ใช้จำนวนฮับครบแล้ว ดู Pro เพื่อสร้างเพิ่ม":"สร้างหน้ารวมลิงก์ใหม่ เริ่มเป็นฉบับร่าง"}>{atLimit?<Sparkles size={19}/>:<Plus size={19}/>}<span>{atLimit?"เพิ่มฮับด้วย Pro":"สร้างฮับใหม่"}</span></button></div>
        <div className="hs-workspace-metrics" aria-label="ภาพรวมทุกฮับ"><article><span className="hs-small-icon"><LayoutGrid size={22}/></span><div><p>ฮับที่ใช้งาน</p><strong>{count.format(workspace.usage.pages)}<small> / {workspace.limits.maxPages}</small></strong><span>{publishedPages.length} ฮับเผยแพร่แล้ว</span></div></article><article><span className="hs-small-icon hs-icon-blue"><Link2 size={22}/></span><div><p>เนื้อหาทั้งหมด</p><strong>{count.format(workspace.usage.links)}</strong><span>รวมจากทุกฮับของคุณ</span></div></article><article><span className="hs-small-icon hs-icon-violet"><BarChart3 size={22}/></span><div><p>สถิติการคลิก</p>{workspace.account.entitlements.analytics&&workspace.usage.totalClicks!==null?<><strong>{count.format(workspace.usage.totalClicks)}</strong><span>คลิกสะสมจากผู้เข้าชม</span></>:<><strong className="hs-stat-pro-label"><LockKeyhole size={17}/>Pro</strong><button type="button" className="hs-stat-upgrade" onClick={()=>navigate("billing")}>ปลดล็อกสถิติ<ArrowUpRight size={13}/></button></>}</div></article></div>
        {workspace.pages.length===0?((workspace.sharedPages||[]).length>0?null:<div className="hs-welcome"><div className="hs-welcome-art" aria-hidden="true"><span className="hs-welcome-ring"/><div className="hs-mini-hub"><span className="hs-mini-avatar">น</span><b>พื้นที่ของคุณ</b><i/><i/><i/></div><span className="hs-float-icon hs-float-one"><Link2 size={23}/></span><span className="hs-float-icon hs-float-two"><Sparkles size={22}/></span></div><h2>เริ่มฮับแรกของคุณ</h2><p>รวมเว็บไซต์ ร้านค้า และช่องทางติดตามไว้ในลิงก์เดียว<br/>แต่งหน้าให้เป็นคุณ แล้วเผยแพร่เพื่อเริ่มแชร์ได้เลย</p><div className="hs-onboarding-steps"><span><b>1</b>ตั้งชื่อฮับ</span><ArrowRight size={16}/><span><b>2</b>เพิ่มลิงก์</span><ArrowRight size={16}/><span><b>3</b>เผยแพร่</span></div><button className="hs-button hs-primary" onClick={startCreate}>สร้างฮับแรกของฉัน <ArrowRight size={19}/></button></div>):<>
          <div className="hs-section-title"><h2>ฮับทั้งหมด <span>{workspace.pages.length}</span></h2><span><ShieldCheck size={15}/>ฉบับร่างจะแสดงให้ผู้ชมเห็นเมื่อเผยแพร่</span></div>
          {(workspace.pages.length>3||pageQuery||pageFilter!=="all")&&<div className="hs-hub-filters"><label className="hs-hub-search"><Search size={18}/><span className="hs-sr-only">ค้นหาฮับ</span><input type="search" value={pageQuery} onChange={event=>setPageQuery(event.target.value)} placeholder="ค้นหาชื่อหรือ URL ของฮับ"/></label><div role="group" aria-label="กรองสถานะฮับ">{([{id:"all",label:"ทั้งหมด"},{id:"published",label:"เผยแพร่แล้ว"},{id:"draft",label:"ฉบับร่าง"},{id:"suspended",label:"พักการเผยแพร่"}] as const).map(filter=><button key={filter.id} aria-pressed={pageFilter===filter.id} className={pageFilter===filter.id?"active":""} onClick={()=>setPageFilter(filter.id)}>{filter.label}</button>)}</div></div>}
          <div className="hs-pages-grid">{shownPages.map(page=><article className="hs-page-card" key={page.id}>
            <div className={`hs-page-card-cover hs-background-${page.profile.background}`} style={{"--hs-page-accent":page.profile.accent} as CSSProperties}>
              <div className="hs-card-avatar">{page.profile.avatarUrl?<img src={page.profile.avatarUrl} alt=""/>:page.profile.name.slice(0,1)}</div>
              <div className="hs-card-title"><h3>{page.title}</h3><span className="hs-card-url">/h/{page.slug}</span></div>
            </div>
            <div className="hs-page-card-body">
              <div className="hs-card-overview"><span className={`hs-page-status ${page.suspended?"hs-status-suspended":!page.published?"hs-status-draft":page.hasUnpublishedChanges?"hs-status-pending":"hs-status-live"}`}><span/>{pageStatus(page)}</span><span className="hs-card-updated">แก้ไข {dateLabel(page.updatedAt)}</span></div>{page.suspended&&<div className="hs-card-suspension"><ShieldCheck size={17}/><p><strong>พักการเผยแพร่โดยผู้ดูแล</strong>{page.suspensionReason||"ติดต่อผู้ดูแลเพื่อดูรายละเอียด"}</p></div>}<div className="hs-card-stats"><span><Link2 size={17}/><strong>{count.format(page.linkCount)}</strong> รายการ</span><button type="button" className="hs-card-stats-action" data-tooltip={workspace.account.entitlements.analytics?"ดูยอดเข้าชมและสถิติการคลิกของฮับนี้":"สถิติการเข้าชมและลิงก์เปิดให้สมาชิก Pro"} disabled={!!busy} aria-label={`ดูสถิติ ${page.title}`} onClick={()=>void openEditor(page.id,"analytics")}>{workspace.account.entitlements.analytics&&page.totalClicks!==null?<><BarChart3 size={17}/><strong>{count.format(page.totalClicks)}</strong> คลิก <span>ดูสถิติ</span></>:<span className="hs-stats-locked"><LockKeyhole size={15}/>ดูสถิติ <span className="hs-stats-pro-tag">PRO</span></span>}<ArrowUpRight size={15}/></button></div><div className="hs-card-actions"><button className="hs-button hs-primary" disabled={!!busy} onClick={()=>void openEditor(page.id)}>{busy==="open-"+page.id?<LoaderCircle size={18} className="hs-spin"/>:<PencilLine size={18}/>}แก้ไขฮับ</button>{page.published&&!page.suspended?<button className="hs-button hs-outline" data-tooltip="คัดลอก URL ของฮับเพื่อส่งต่อหรือใส่ใน Bio" aria-label={`คัดลอก URL ${page.title}`} onClick={()=>void copyPage(page)}><Copy size={18}/>คัดลอกลิงก์</button>:<button className="hs-button hs-outline" aria-label={`ดูฉบับร่าง ${page.title}`} disabled={!!busy} onClick={()=>void openEditor(page.id)}><Eye size={18}/>ดูฉบับร่าง</button>}</div><div className="hs-card-secondary-actions">
  <button type="button" className="hs-card-more-trigger" aria-controls={`hs-card-actions-${page.id}`}
    aria-expanded={openCardMenu===page.id} onClick={()=>setOpenCardMenu(current=>current===page.id?null:page.id)}>
    <MoreHorizontal size={17}/>เพิ่มเติม<ChevronDown size={15}/>
  </button>
  <div className="hs-card-secondary-menu" id={`hs-card-actions-${page.id}`}
    data-open={openCardMenu===page.id?"true":"false"}>{page.published&&!page.suspended?<a href={`/h/${page.slug}`} target="_blank" rel="noopener" data-tooltip="เปิดฮับที่เผยแพร่แล้วในแท็บใหม่" aria-label={`เปิด ${page.title}`}><ExternalLink size={16}/>เปิดหน้าเว็บ</a>:<span>{page.suspended?"หน้าสาธารณะพักการใช้งาน":"ยังไม่มีหน้าสาธารณะ"}</span>}<button data-tooltip="เก็บฮับเข้าคลังและหยุดเผยแพร่ ข้อมูลยังอยู่และกู้คืนได้" aria-label={`เก็บฮับ ${page.title} เข้าคลัง`} aria-expanded={archivePage===page.id} disabled={!!busy} onClick={()=>setArchivePage(archivePage===page.id?null:page.id)}><Archive size={16}/>เก็บเข้าคลัง</button></div>
</div>{archivePage===page.id&&<div className="hs-inline-confirm"><p>เก็บฮับนี้เข้าคลัง?<span>หน้าเว็บจะหยุดแสดง ข้อมูลและสถิติยังอยู่ กู้คืนได้ภายหลัง</span></p><div><button onClick={()=>setArchivePage(null)} disabled={!!busy}>ยกเลิก</button><button className="hs-danger-text" disabled={!!busy} onClick={()=>void deletePage(page)}>ยืนยันเก็บเข้าคลัง</button></div></div>}</div>
          </article>)}{shownPages.length===0&&<div className="hs-no-search"><Search size={26}/><h3>ไม่พบฮับที่ตรงกัน</h3><p>ลองค้นหาด้วยชื่ออื่น หรือเลือกสถานะทั้งหมด</p><button className="hs-button hs-outline" onClick={()=>{setPageQuery("");setPageFilter("all");}}>แสดงฮับทั้งหมด</button></div>}</div>

        </>}
        {(workspace.sharedPages||[]).length>0&&<section className="ht-shared-section"><div className="hs-section-title"><h2>ฮับที่ร่วมงาน <span>{workspace.sharedPages.length}</span></h2></div><p>ฮับที่ได้รับสิทธิ์จากทีม ไม่รวมในจำนวนฮับส่วนตัวของคุณ</p><div className="hs-pages-grid">{workspace.sharedPages.map(page=><article key={page.id} className="hs-page-card"><div className="hs-page-card-body"><h3>{page.title}</h3><p className="hs-card-url">/h/{page.slug}</p><p className="ht-shared-owner"><Users size={14}/>{page.access?.ownerName} · {page.access?.role==="editor"?"ผู้แก้ไข":"ผู้ดู"}</p><div className="ht-shared-card-actions"><button type="button" className="hs-button hs-primary" disabled={!!busy} onClick={()=>void openEditor(page.id,page.access?.canEdit?"content":"analytics")}>{page.access?.canEdit?<Settings2 size={16}/>:<BarChart3 size={16}/>} {page.access?.canEdit?"แก้ไขฮับ":"ดูสถิติ"}</button>{page.access?.canEdit&&<button type="button" className="hs-button hs-outline" disabled={!!busy} onClick={()=>void openEditor(page.id,"analytics")}><BarChart3 size={16}/>สถิติ</button>}</div></div></article>)}</div></section>}
        {(workspace.archivedPages||[]).length>0&&<details className="hs-workspace-archive"><summary><span><Archive size={18}/>ฮับในคลัง <b>{workspace.archivedPages.length}</b></span><ChevronDown size={18}/></summary><p>ข้อมูลและประวัติยังอยู่ครบ กู้คืนเป็นฉบับร่างได้ตามจำนวนฮับที่แพ็กเกจรองรับ</p>{workspace.archivedPages.map(page=><article key={page.id}><span className="hs-archived-page-avatar" style={{background:page.profile.accent}}>{page.profile.avatarUrl?<img src={page.profile.avatarUrl} alt=""/>:page.title.slice(0,1)}</span><div><strong>{page.title}</strong><span>/h/{page.slug} · {page.linkCount} รายการ · {page.totalClicks!==null?`${count.format(page.totalClicks)} คลิก`:"สถิติสำหรับ Pro"}</span></div><button className="hs-button hs-outline" disabled={!!busy} onClick={()=>void restorePage(page)}>{busy===page.id?<LoaderCircle className="hs-spin" size={17}/>:<RotateCcw size={17}/>}กู้คืนฮับ</button></article>)}</details>}
      </>}
      {screen==="create"&&<section className="hs-create"><button className="hs-back-button" onClick={()=>navigate("pages")}><ArrowLeft size={17}/>กลับไปฮับของฉัน</button><div className="hs-create-heading"><p className="hs-kicker">ฮับใหม่ของคุณ</p><h1>เริ่มสร้างฮับ</h1><p>ตั้งชื่อ เลือกหน้าตา แล้วค่อยเติมรายละเอียดได้เสมอ</p></div><form onSubmit={createPage}><section className="hs-panel"><div className="hs-number-heading"><span>01</span><div><h2>ฮับนี้ชื่ออะไรดี?</h2><p>ชื่อที่คนจะเห็นบนหน้าโปรไฟล์ของคุณ</p></div></div><label className="hs-field">ชื่อฮับ<input required autoFocus maxLength={80} value={name} onChange={event=>setName(event.target.value)} placeholder="ชื่อคุณ แบรนด์ หรือร้านค้า" disabled={!!busy}/></label><label className="hs-field">URL ของฮับ<div className="hs-url-input"><span>/h/</span><input required autoCapitalize="none" spellCheck={false} minLength={3} maxLength={40} value={newSlug} onChange={event=>setNewSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="your-name" disabled={!!busy}/></div><span className={`hs-slug-feedback hs-slug-${slugCheck.status}`} aria-live="polite">{slugCheck.status==="checking"?<LoaderCircle className="hs-spin" size={12}/>:slugCheck.status==="available"?<Check size={13}/>:null}{slugCheck.message||"ใช้ตัวอักษรอังกฤษ ตัวเลข หรือขีดกลาง"}</span></label></section><section className="hs-panel"><div className="hs-number-heading"><span>02</span><div><h2>เลือกจุดเริ่มต้นที่ใช่</h2><p>เปลี่ยนรูปแบบและสีภายหลังได้</p></div></div><div className="hs-template-options">{TEMPLATES.map(item=><button key={item.id} type="button" className={`hs-template ${template===item.id?"selected":""}`} onClick={()=>setTemplate(item.id)} aria-pressed={template===item.id}><span className={`hs-template-art hs-template-${item.id}`} style={{"--template-accent":item.accent} as CSSProperties}><span className="hs-template-avatar"/><span className="hs-template-name"/><span className="hs-template-lines"><i/><i/><i/></span></span><span className="hs-template-title">{item.name}{template===item.id&&<Check size={16}/>}</span><span className="hs-template-desc">{item.description}</span></button>)}</div></section><div className="hs-create-footer"><p><ShieldCheck size={14}/>ฮับใหม่จะเริ่มเป็นฉบับร่าง</p><button className="hs-button hs-primary" type="submit" disabled={!!busy||!name.trim()||!newSlug||slugCheck.status==="checking"||slugCheck.status==="taken"}>{busy==="create"?<LoaderCircle size={17} className="hs-spin"/>:<Plus size={17}/>}สร้างฮับของฉัน</button></div></form></section>}
      {screen==="editor"&&editor&&profile&&<>
        <div className="hs-editor-heading"><button className="hs-editor-back" aria-label="กลับไปฮับของฉัน" data-tooltip="กลับไปดูฮับทั้งหมดในบัญชี" onClick={()=>navigate("pages")}><ArrowLeft size={19}/></button><div><h1>{editor.profile.name}</h1><div><span className={`hs-status-pill ${editor.page.suspended?"hs-status-suspended":editor.page.published&&!editor.page.hasUnpublishedChanges?"hs-published":editor.page.published?"hs-status-pending":""}`}>{pageStatus(editor.page)}</span><span className="hs-editor-slug">/h/{editor.page.slug}</span></div></div><div className="hs-editor-heading-actions">{editorCanManage&&<button type="button" className="hs-button hs-outline" onClick={manageTeam} data-tooltip="เลือกทีมและเชิญคนมาช่วยดูแลฮับนี้"><Users size={17}/><span>ผู้ร่วมงาน</span></button>}{editor.page.published&&!editor.page.suspended&&<a href={`/h/${editor.page.slug}`} className="hs-button hs-outline" target="_blank" rel="noopener" aria-label="เปิดฮับในแท็บใหม่" data-tooltip="เปิดหน้าที่ผู้เข้าชมเห็นในแท็บใหม่"><ExternalLink size={15}/><span>เปิดฮับ</span></a>}{editorCanEdit&&<button className="hs-button hs-outline hs-mobile-preview" aria-label="ดูตัวอย่างฮับ" onClick={()=>setPreview(true)}><Eye size={18}/>ดูตัวอย่าง</button>}{editorCanPublish&&<button className="hs-button hs-primary hs-publish-button" data-tooltip={editor.page.suspended?"ผู้ดูแลพักการเผยแพร่ฮับนี้ไว้ ติดต่อผู้ดูแลเพื่อขอเปิดใช้งาน":hasUnsaved?"บันทึกการแก้ไขก่อนเผยแพร่":editor.page.published&&!editor.page.hasUnpublishedChanges?"ฮับแสดงข้อมูลล่าสุดแล้ว":"อัปเดตฉบับร่างให้ผู้เข้าชมเห็นบนหน้าฮับจริง"} disabled={!!busy||hasUnsaved||editor.page.suspended||(editor.page.published&&!editor.page.hasUnpublishedChanges)} onClick={()=>void publish()}>{busy==="publish"?<LoaderCircle className="hs-spin" size={17}/>:<Globe2 size={17}/>}<span>{editor.page.suspended?"พักการเผยแพร่อยู่":editor.page.published&&!editor.page.hasUnpublishedChanges?"เผยแพร่ล่าสุดแล้ว":editor.page.published?"เผยแพร่การเปลี่ยนแปลง":"เผยแพร่ฮับ"}</span></button>}</div></div>
        {!editorCanManage&&<div className="ht-editor-access"><Users size={19}/><span>ฮับของ {editor.access.ownerName} · {editorCanEdit?"คุณแก้ไขฉบับร่างได้":"คุณมีสิทธิ์ดูสถิติ"}{editorCanEdit&&!editorCanPublish?" · เจ้าของเป็นผู้เผยแพร่":""}</span></div>}
        {editor.page.suspended&&<aside className="hs-suspension-notice" aria-label="สถานะการเผยแพร่ฮับ"><ShieldCheck size={22}/><div><strong>ผู้ดูแลพักการเผยแพร่ฮับนี้ไว้</strong><p>{editor.page.suspensionReason||"ติดต่อผู้ดูแลเพื่อตรวจสอบรายละเอียด"}</p><small>หน้าสาธารณะยังไม่เปิดให้ผู้เข้าชม คุณแก้ไขและบันทึกฉบับร่างได้ เมื่อผู้ดูแลยกเลิกการพัก ฮับจะกลับไปใช้สถานะเผยแพร่เดิม</small><a href="https://lin.ee/nVlMMME" target="_blank" rel="noopener noreferrer">ติดต่อ นากนะ HUB<ArrowUpRight size={15}/></a></div></aside>}
        <div className="hs-editor-tabs" role="group" aria-label="ส่วนที่ต้องการแก้ไข">{editorCanEdit&&<><button aria-pressed={editorTab==="content"} className={editorTab==="content"?"active":""} onClick={()=>switchEditorTab("content")}><LayoutGrid size={19}/>เนื้อหา</button><button aria-pressed={editorTab==="appearance"} className={editorTab==="appearance"?"active":""} onClick={()=>switchEditorTab("appearance")}><Palette size={19}/>ออกแบบ</button></>}<button aria-pressed={editorTab==="analytics"} className={`hs-analytics-tab ${editorTab==="analytics"?"active":""}`} onClick={()=>switchEditorTab("analytics")}><BarChart3 size={19}/>สถิติ{!editorAnalytics&&<span className="hs-stats-pro-tag">PRO</span>}</button><span>{hasUnsaved?"ยังมีข้อมูลไม่ได้บันทึก":editor.page.hasUnpublishedChanges?"บันทึกฉบับร่างแล้ว":"ข้อมูลล่าสุด"}</span></div>
        {editorTab!=="analytics"?<div className="hs-editor-grid"><section className="hs-edit-column">
          {editorTab==="content"&&<>
            <div className="hs-content-intro"><div><h2>เนื้อหาบนฮับของคุณ</h2><p>เล่าเรื่องด้วยรูป ผลงาน และบริการ แล้วพาคนไปต่อ</p></div><span title="รวมเนื้อหาทุกประเภท ทั้งรายการที่แสดงและซ่อน">{links.length}/{editorLimit} รายการ</span></div>
            <div className="hs-add-actions"><button className="hs-button hs-primary hce-add-button" disabled={!!busy||links.length>=editorLimit||!!newBlockType} onClick={()=>setContentPicker(!contentPicker)} aria-expanded={contentPicker}><Plus size={19}/>เพิ่มเนื้อหา</button><span className="hce-add-hint"><LayoutGrid size={15}/>7 รูปแบบพร้อมใช้</span></div>
            {links.length>=editorLimit&&<p className="hce-quota-note">ใช้ครบ {editorLimit} รายการแล้ว เก็บรายการที่ไม่ใช้เข้าคลังเพื่อเพิ่มรายการใหม่{editorPlan==="starter"?" หรือเลือก Pro เพื่อเพิ่มได้ถึง 100 รายการต่อฮับ":""}</p>}
            {contentPicker&&!newBlockType&&<ContentTypePicker onChoose={addContent} onClose={()=>setContentPicker(false)} disabled={!!busy}/>}
            {newBlockType&&!newBlockAfterId&&<form className="hs-panel hs-new-block-form" onSubmit={createBlock} aria-busy={!!busy}><div className="hs-panel-heading"><div><span className="hce-new-form-badge">เนื้อหาใหม่</span><h2>{CONTENT_OPTIONS.find(item=>item.type===newBlockType)?.label}</h2></div><button type="button" aria-label="ยกเลิกเพิ่มรายการ" disabled={!!busy} onClick={cancelNewContent}><X size={18}/></button></div><ContentFields pageId={editor.page.id} draft={newBlockDraft} onChange={setNewBlockDraft} disabled={!!busy} onUploadingChange={setMediaUploading} autoFocus/><div className="hs-new-block-actions"><button type="button" className="hs-button hs-outline" disabled={!!busy} onClick={cancelNewContent}>ยกเลิก</button><button type="submit" className="hs-button hs-primary" disabled={!!busy}>{busy==="add"?<LoaderCircle className="hs-spin" size={16}/>:<Plus size={16}/>}เพิ่มรายการ</button></div></form>}
            {links.length===0&&!newBlockType?<div className="hs-editor-empty"><span><ImageIcon size={27}/></span><h3>เริ่มเล่าเรื่องของคุณ</h3><p>เพิ่มรูป ผลงาน บริการ หรือลิงก์แรก<br/>แล้วดูหน้าฮับเปลี่ยนไปพร้อมกัน</p><button type="button" className="hs-button hs-primary" onClick={()=>setContentPicker(true)}><Plus size={17}/>เลือกเนื้อหาแรก</button></div>:<div className="hs-link-rows">{links.map((link,index)=>(link.type==="service"||link.type==="promotion")?
              (link.id!==productLinks[0]?.id?null:
               <section key={link.id} className="hs-product-collection" aria-labelledby="hs-product-collection-title">
                 <header className="hs-product-collection-header">
                   <span className="hs-product-collection-icon"><Package size={22}/></span>
                   <div className="hs-product-collection-heading">
                     <h3 id="hs-product-collection-title">สินค้า / บริการ</h3>
                     <p>สินค้าทั่วไปและสินค้าลดราคาอยู่ในการ์ดชุดเดียว · เลื่อนดูซ้าย–ขวาได้</p>
                   </div>
                   <span className="hs-product-collection-count">{productLinks.length} สินค้า</span>
                 </header>
                 <div className="hs-product-collection-list" role="group" aria-label="รายการสินค้า">
                   {productLinks.map((product,productIndex)=><LinkRow key={`${product.id}:${saveEpoch}`}
                     pageId={editor.page.id} link={product} index={productIndex} total={productLinks.length}
                     busy={!!busy} onArchive={archiveLink}
                     onReorder={reorderProduct} onDirty={markDirty} onDraft={markDraft}
                     onUploadState={setMediaUploading} onStatistics={showLinkStatistics}
                     hasAnalyticsAccess={editorAnalytics} onDuplicate={duplicateBlock}
                     canDuplicate={links.length<editorLimit}/>)}
                 </div>
                 {(newBlockType==="service"||newBlockType==="promotion")&&!!newBlockAfterId&&
                   <form className="hs-panel hs-new-block-form hs-inline-product-form"
                     onSubmit={createBlock} aria-busy={!!busy}>
                     <div className="hs-panel-heading"><div>
                       <span className="hce-new-form-badge">สินค้าใหม่</span>
                       <h2>{CONTENT_OPTIONS.find(item=>item.type===newBlockType)?.label}</h2>
                     </div>
                       <button type="button" aria-label="ยกเลิกเพิ่มสินค้า" disabled={!!busy}
                         onClick={cancelNewContent}><X size={18}/></button>
                     </div>
                     <ContentFields pageId={editor.page.id} draft={newBlockDraft}
                       onChange={setNewBlockDraft} disabled={!!busy}
                       onUploadingChange={setMediaUploading} autoFocus/>
                     <div className="hs-new-block-actions">
                       <button type="button" className="hs-button hs-outline"
                         disabled={!!busy} onClick={cancelNewContent}>ยกเลิก</button>
                       <button type="submit" className="hs-button hs-primary" disabled={!!busy}>
                         {busy==="add"?<LoaderCircle className="hs-spin" size={16}/>:<Plus size={16}/>}เพิ่มสินค้า
                       </button>
                     </div>
                   </form>}
                 <div className="hs-product-collection-actions">
                   <div className="hs-product-add-choices">
                     <button type="button" className="hs-add-next-product"
                       disabled={!!busy||links.length>=editorLimit||!!newBlockType}
                       onClick={()=>addProductAfter(productLinks[0].id)}>
                       <Plus size={17}/>เพิ่มสินค้า
                     </button>
                     <button type="button" className="hs-add-next-product hs-add-discount-product"
                       disabled={!!busy||links.length>=editorLimit||!!newBlockType}
                       onClick={()=>addPromotionAfter(productLinks[0].id)}>
                       <BadgePercent size={17}/>เพิ่มสินค้าลดราคา
                     </button>
                   </div>
                   <small>ทุกสินค้าอยู่ในแถบเดียวกัน · 1 ชิ้นนับเป็น 1 รายการในแพ็กเกจ</small>
                 </div>
               </section>)
              :<LinkRow key={`${link.id}:${saveEpoch}`} pageId={editor.page.id} link={link}
                index={index} total={links.length} busy={!!busy}
                onArchive={archiveLink} onReorder={reorder}
                onDirty={markDirty} onDraft={markDraft} onUploadState={setMediaUploading}
                onStatistics={showLinkStatistics} hasAnalyticsAccess={editorAnalytics}
                onDuplicate={duplicateBlock} canDuplicate={links.length<editorLimit}/>)}</div>}
            {archivedLinks.length>0&&<details className="hs-archive"><summary><span><Archive size={15}/>เนื้อหาในคลัง <b>{archivedLinks.length}</b></span><ChevronDown size={16}/></summary><p>กู้คืนได้โดยไม่เสียประวัติคลิก</p>{archivedLinks.map(link=><div className="hs-archived-row" key={link.id}><HubLinkIcon icon={link.type==="heading"?"file":link.icon} url={link.url} size={21}/><span>{link.title}</span><button className="hs-button hs-outline" disabled={!!busy||links.length>=editorLimit} data-tooltip={links.length>=editorLimit?`ครบ ${editorLimit} รายการแล้ว เก็บรายการที่ไม่ใช้เข้าคลังก่อนกู้คืน`:"นำรายการกลับมาแก้ไขในฉบับร่าง"} onClick={()=>void patchLink(link,{archived:false,enabled:false,sortOrder:Math.max(-1,...links.map(item=>item.sortOrder))+1})}><RotateCcw size={13}/>กู้คืน</button></div>)}</details>}
            <div className="hs-edit-note"><ShieldCheck size={16}/><p><strong>บันทึกก่อน แล้วค่อยเผยแพร่</strong>รูปและเนื้อหาจะอยู่ในฉบับร่าง กด “เผยแพร่การเปลี่ยนแปลง” เมื่อพร้อมให้คนเข้าชม</p></div>
            <div className="hs-profile-save hs-content-save" aria-label="บันทึกการแก้ไขเนื้อหาทั้งหมด">
              <span role="status">{unsavedCount?`มีการแก้ไขที่ยังไม่บันทึก ${unsavedCount} รายการ`:"บันทึกข้อมูลครบแล้ว"}</span>
              <div>
                <button type="button" className="hs-button hs-outline" disabled={!unsavedCount||!!busy} onClick={discardLinkEdits}>ยกเลิก</button>
                <button type="button" className="hs-button hs-primary" disabled={!unsavedCount||!!busy} onClick={()=>void saveAllLinks()}>{busy==="save-all"?<LoaderCircle size={16} className="hs-spin"/>:<Check size={16}/>}บันทึก</button>
              </div>
            </div>
          </>}
          {editorTab==="appearance"&&<form className="hs-profile-form" aria-busy={!!busy} onSubmit={saveProfile} onInvalidCapture={event=>{const group=(event.target as HTMLElement).closest("details");if(group)group.open=true;}}><fieldset className="htg-form-fieldset" disabled={!!busy}><HubThemeGallery key={editor.page.id} profile={profile} links={previewLinks} savedThemeId={editor.profile.themeId} dirty={profileDirty} busy={!!busy} onChange={setProfile} onPreview={()=>setPreview(true)}/><details className="hs-panel htg-details"><summary><ImageIcon size={20}/><span><strong>รูปและข้อความของคุณ</strong><small>ชื่อ รูปโปรไฟล์ และเรื่องราวที่อยากเล่า</small></span></summary><div className="htg-details-body"><div className="hs-avatar-editor"><div className="hs-avatar-preview" style={{background:profile.accent}}>{profile.avatarUrl?<img src={profile.avatarUrl} alt="รูปโปรไฟล์"/>:profile.name.slice(0,1)||<ImageIcon size={25}/>}</div><div><button type="button" className="hs-button hs-outline" disabled={!!busy} onClick={()=>uploadRef.current?.click()}>{busy==="avatar"?<LoaderCircle size={15} className="hs-spin"/>:<Upload size={15}/>}อัปโหลดรูป</button>{profile.avatarUrl&&<button type="button" className="hs-remove-avatar" disabled={!!busy} onClick={()=>void removeAvatar()}>นำรูปออก</button>}<p>PNG, JPG, WebP ไม่เกิน 2 MB</p></div><input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>void uploadAvatar(event.target.files?.[0])}/></div><label className="hs-field">ชื่อที่แสดง<input required maxLength={80} value={profile.name} onChange={event=>setProfile({...profile,name:event.target.value})}/></label><div className="hs-form-columns"><label className="hs-field">ชื่อบัญชี<input maxLength={80} value={profile.handle} onChange={event=>setProfile({...profile,handle:event.target.value})} placeholder="@yourname"/></label><label className="hs-field">ข้อความสั้น<input maxLength={120} value={profile.tagline} onChange={event=>setProfile({...profile,tagline:event.target.value})} placeholder="บอกสิ่งที่คุณทำ"/></label></div><label className="hs-field">เรื่องราวของคุณ<textarea rows={3} maxLength={280} value={profile.bio} onChange={event=>setProfile({...profile,bio:event.target.value})} placeholder="แนะนำตัวสั้น ๆ ให้คนอยากรู้จักมากขึ้น"/><small>{profile.bio.length}/280 ตัวอักษร</small></label></div></details>
            <HubShareSettings pageId={editor.page.id} profile={profile} slug={slug} origin={origin} onChange={setProfile} disabled={!!busy} onUploadingChange={setMediaUploading}/><details className="hs-panel htg-details"><summary><Settings2 size={20}/><span><strong>ปรับแต่งเพิ่มเติม</strong><small>ไม่จำเป็นต้องปรับ ธีมจัดสีและรูปแบบไว้ให้แล้ว</small></span></summary><div className="htg-details-body"><p className="htg-manual-note">ปรับสีหลักและการวางหน้าต่อได้ตามใจ หากเปลี่ยนพื้นหลังหรือโทนสว่าง–เข้ม จะกลับไปใช้สไตล์ปรับเอง</p><div className="hs-layout-options" role="group" aria-label="รูปแบบหน้าเว็บ">{([{id:"stack",label:"เรียบง่าย"},{id:"grid",label:"แกลเลอรี"},{id:"editorial",label:"โปรไฟล์"}] as const).map(item=><button key={item.id} type="button" className={`hs-layout-choice ${profile.layout===item.id?"selected":""}`} aria-pressed={profile.layout===item.id} onClick={()=>setProfile({...profile,layout:item.id})}><span className={`hs-layout-sketch hs-sketch-${item.id}`}><i/><i/><i/></span><span>{item.label}{profile.layout===item.id&&<Check size={12}/>}</span></button>)}</div><div className="hs-design-options"><fieldset><legend>พื้นหลัง</legend><div className="hs-background-options">{BACKGROUNDS.map(item=><button key={item.id} type="button" style={{background:item.color}} className={profile.background===item.id?"selected":""} aria-label={`พื้นหลัง ${item.name}`} data-tooltip={`เปลี่ยนพื้นหลังเป็น ${item.name}`} aria-pressed={profile.background===item.id} onClick={()=>setProfile({...profile,themeId:"custom",background:item.id})}>{profile.background===item.id&&<Check size={15} color={item.id==="ink"?"white":"#173536"}/>}</button>)}</div></fieldset><fieldset><legend>สีของคุณ</legend><label className="hs-color-picker"><input type="color" aria-label="สีหลักของฮับ" value={profile.accent} onChange={event=>setProfile({...profile,accent:event.target.value})}/><span>{profile.accent.toUpperCase()}</span></label></fieldset></div><fieldset className="hs-theme-field"><legend>โทนสีเนื้อหา</legend><div><button type="button" className={profile.theme==="light"?"selected":""} aria-pressed={profile.theme==="light"} onClick={()=>setProfile({...profile,themeId:"custom",theme:"light"})}>สว่าง</button><button type="button" className={profile.theme==="dark"?"selected":""} aria-pressed={profile.theme==="dark"} onClick={()=>setProfile({...profile,themeId:"custom",theme:"dark"})}>เข้ม</button></div></fieldset></div></details><section className="hs-panel htg-brand-panel"><div className="hb-appearance-branding"><div><div><h3>แบรนด์ท้ายหน้า</h3><p>ซ่อนโลโก้ นากนะ HUB และข้อความท้ายหน้าสาธารณะ เพื่อให้พื้นที่นี้เป็นแบรนด์ของคุณ</p></div>{editorPlan!=="pro"&&<span className="hb-lock-pill"><LockKeyhole size={12}/>PRO</span>}</div>{editorPlan==="pro"?<label className="hb-branding-switch"><span>ซ่อนแบรนด์ นากนะ HUB ท้ายหน้า</span><input type="checkbox" checked={!profile.showBranding} onChange={event=>setProfile({...profile,showBranding:!event.target.checked})} data-tooltip="เปิดเพื่อซ่อนโลโก้และข้อความของแพลตฟอร์ม จากนั้นบันทึกและเผยแพร่"/></label>:<div className="hb-upgrade-brand"><span><strong>ใช้แบรนด์ของคุณเองด้วย Pro</strong>฿149 / เดือน หรือ ฿1,490 / ปี</span>{editorCanManage?<button type="button" onClick={()=>navigate("billing")} data-tooltip="ดูแพ็กเกจ Pro เพื่อปลดล็อกการซ่อนแบรนด์ท้ายหน้า">ดูแพ็กเกจ Pro<ArrowUpRight size={14}/></button>:<span>เจ้าของฮับเป็นผู้จัดการแพ็กเกจ</span>}</div>}<p>ชื่อฮับและโลโก้ที่คุณใส่ไว้ยังแสดงตามปกติ</p></div></section>
            <details className="hs-panel htg-details"><summary><Link2 size={20}/><span><strong>ที่อยู่และการเผยแพร่</strong><small>/h/{slug}</small></span></summary><div className="htg-details-body"><label className="hs-field">URL<div className="hs-url-input"><span>/h/</span><input required value={slug} minLength={3} maxLength={40} spellCheck={false} autoCapitalize="none" disabled={editor.page.published||!editorCanManage} onChange={event=>setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))}/></div><small>{editor.page.published?"หยุดเผยแพร่ก่อนเปลี่ยน URL เพื่อไม่ให้ลิงก์ที่แชร์ไว้เปลี่ยนโดยไม่ตั้งใจ":"ตรวจชื่อว่างอีกครั้งเมื่อบันทึก"}</small></label>{editor.page.published&&<><div className="hs-live-url"><span>{pageUrl}</span><button type="button" aria-label="คัดลอก URL" data-tooltip="คัดลอกที่อยู่ฮับเพื่อแชร์" onClick={()=>void copyPage(editor.page)}><Copy size={15}/></button></div>{editorCanManage&&<><button className="hs-unpublish-toggle" type="button" disabled={!!busy} onClick={()=>setUnpublishConfirm(!unpublishConfirm)}>หยุดเผยแพร่ฮับนี้</button>{unpublishConfirm&&<div className="hs-inline-confirm"><p>หยุดเผยแพร่?<span>ผู้ชมจะเปิดหน้านี้ไม่ได้จนกว่าจะเผยแพร่อีกครั้ง</span></p><div><button type="button" onClick={()=>setUnpublishConfirm(false)} disabled={!!busy}>ยกเลิก</button><button type="button" className="hs-danger-text" disabled={!!busy||hasUnsaved} onClick={()=>void unpublish()}>ยืนยันหยุดเผยแพร่</button></div></div>}</>} </>}</div></details><div className="hs-profile-save"><span>{profileDirty?"มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก":"บันทึกข้อมูลครบแล้ว"}</span><div><button type="button" className="hs-button hs-outline" disabled={!profileDirty||!!busy} onClick={()=>{setProfile(editor.profile);setSlug(editor.page.slug);}}>ยกเลิก</button><button className="hs-button hs-primary" type="submit" disabled={!profileDirty||!!busy}>{busy==="profile"?<LoaderCircle size={16} className="hs-spin"/>:<Check size={16}/>}บันทึก</button></div></div></fieldset></form>}
        </section><aside ref={previewOverlayRef} className={`hs-preview-column ${preview?"hs-preview-open":""}`} role={preview?"dialog":undefined} aria-modal={preview?true:undefined} aria-label={preview?"ตัวอย่างฮับฉบับร่าง":undefined} tabIndex={preview?-1:undefined}><div className="hs-preview-sticky"><div className="hs-preview-title"><span><Eye size={18}/>ตัวอย่างบนมือถือ</span><span>ฉบับร่าง <button ref={previewCloseRef} className="hs-close-preview" aria-label="ปิดตัวอย่าง" onClick={()=>setPreview(false)}><X size={18}/></button></span></div><div className="hs-preview-browser"><div className="hs-browser-toolbar"><span/><span/><span/><div>/h/{slug}</div><Globe2 size={12}/></div><div className="hs-preview-scroll"><HubCanvas profile={profile} links={previewLinks} slug={slug} preview compact/></div></div><p className="hs-preview-caption">พรีวิวไม่นับยอดคลิก · ดูการแก้ไขได้ก่อนบันทึก</p></div></aside></div>:<>{editorAnalytics?<HubAnalytics page={editor.page} notify={notify} initialLinkId={analyticsLinkId} onAccountRefresh={refreshWorkspace} onUpgrade={()=>editorCanManage?navigate("billing"):notify("ติดต่อเจ้าของฮับเพื่อจัดการแพ็กเกจ")}/>:editorCanManage?<HubAnalyticsUpgrade onUpgrade={()=>navigate("billing")}/>:<div className="ht-owner-analytics-note"><LockKeyhole size={28}/><div><h2>สถิติขึ้นอยู่กับแพ็กเกจของเจ้าของฮับ</h2><p>ให้เจ้าของฮับเปิดแพ็กเกจ Pro แล้วสมาชิกที่ได้รับสิทธิ์จะดูสถิติร่วมกันได้</p></div></div>}</>}
      </>}
      {screen==="teams"&&<HubTeams pages={workspace.pages} initialPageId={teamPageId} onOpenPage={id=>void openEditor(id)} onCreateHub={startCreate} notify={notify} onChanged={refreshWorkspace}/>}
      {screen==="invite"&&inviteToken&&<HubInvitation token={inviteToken} notify={notify} onDone={()=>{setInviteToken("");navigate("pages");}}/>}
      {screen==="billing"&&<HubBilling accountPlan={workspace.account.plan} onAccountRefresh={refreshWorkspace}/>}
      {screen==="account"&&<section className="hs-account-section"><div className="hs-page-heading"><div><p className="hs-kicker">การตั้งค่า</p><h1>บัญชีและการเชื่อมต่อ</h1><p>จัดการบัญชี การเชื่อมต่อ และการแจ้งเตือนของคุณ</p></div></div><div className="hs-account-info"><span className="hs-account-avatar">{workspace.account.displayName.slice(0,1)}</span><div><strong>{workspace.account.displayName}</strong><span>{workspace.account.email||"บัญชี LINE"}</span></div><span className={`hs-plan hs-plan-${workspace.account.plan}`}>{workspace.account.plan.toUpperCase()}</span></div><LineNotifications hasAccess={workspace.account.entitlements.lineDigest} onUpgrade={()=>navigate("billing")} onAccountRefresh={refreshWorkspace}/><div className="hs-current-usage"><div><span>ฮับที่ใช้งาน</span><strong>{workspace.usage.pages} / {workspace.limits.maxPages}</strong><div className="hs-usage-bar"><i style={{width:`${Math.min(100,workspace.usage.pages/workspace.limits.maxPages*100)}%`}}/></div></div><div><span>จำนวนรายการต่อฮับ</span><strong>สูงสุด {workspace.limits.maxLinksPerPage}</strong><p>นับเนื้อหาทุกประเภท · แกลเลอรีหนึ่งชุดเป็นหนึ่งรายการ</p></div></div>{workspace.account.plan!=="pro"&&<div className="hb-account-plan-link"><div><h2>แพ็กเกจที่พอดีกับแบรนด์คุณ</h2><p>ดูราคา Pro เพื่อซ่อนแบรนด์ท้ายหน้า สร้างฮับเพิ่ม หรือจัดการสมาชิกปัจจุบัน</p></div><button className="hs-button hs-primary" onClick={()=>navigate("billing")}><CreditCard size={16}/>แพ็กเกจและการชำระเงิน</button></div>}<button type="button" className="hs-signout" disabled={!!busy} onClick={()=>void signOut()}>{busy==="logout"?<LoaderCircle size={15} className="hs-spin"/>:<LogOut size={15}/>}ออกจากระบบ</button></section>}
      <footer className="hs-studio-footer"><span>นากนะ HUB</span><span>ทุกลิงก์ มีที่ของมัน</span><BuildVersion location="footer"/></footer>
    </main></div>{toast&&<div className="hs-toast" role="status"><Check size={17}/>{toast}</div>}
  </div>;
}

function LinkRow({pageId,link,index,total,busy,onArchive,onReorder,onDirty,onDraft,onUploadState,onStatistics,hasAnalyticsAccess,onDuplicate,canDuplicate}:{pageId:string;link:HubLink;index:number;total:number;busy:boolean;onArchive:(link:HubLink)=>Promise<void>;onReorder:(index:number,direction:number)=>Promise<void>;onDirty:(id:string,dirty:boolean)=>void;onDraft:(id:string,draft:LinkDraft|null)=>void;onUploadState:(uploading:boolean)=>void;onStatistics:(id:string)=>void;hasAnalyticsAccess:boolean;onDuplicate:(link:HubLink)=>Promise<void>;canDuplicate:boolean}){
  const [draft,setDraft]=useState<LinkDraft>(()=>draftOf(link));
  const [expanded,setExpanded]=useState(false);
  const [mediaExpanded,setMediaExpanded]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const [error,setError]=useState("");
  const signature=JSON.stringify(draftOf(link));
  const [baseSignature,setBaseSignature]=useState(signature);
  const dirty=JSON.stringify(draft)!==baseSignature;
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  const rich=isRichContentType(draft.type);
  const option=CONTENT_OPTIONS.find(item=>item.type===draft.type)!;
  const ContentIcon=option.icon;
  const media=draft.type==="gallery"?draft.content?.images?.[0]?.url:draft.content?.imageUrl;
  const promoPrice=draft.type==="promotion"?getPromotionPricing(draft.content?.originalPrice,draft.content?.salePrice):null;
  useEffect(()=>{if(!dirtyRef.current){setDraft(draftOf(link));setBaseSignature(signature);setError("");}},[signature]);
  useEffect(()=>{onDirty(link.id,dirty);onDraft(link.id,dirty?draft:null);},[dirty,draft,link.id,onDirty,onDraft]);
  useEffect(()=>()=>{onDraft(link.id,null);onDirty(link.id,false);},[link.id,onDraft,onDirty]);
  return <article id={`studio-link-${link.id}`} className={`hs-link-row ${draft.type==="heading"?"hs-heading-row":""} ${!draft.enabled?"hs-row-hidden":""}`} aria-label={`${option.short}: ${link.title}`}>
    <form onSubmit={event=>event.preventDefault()} aria-busy={busy}>
      <div className="hs-row-top">
        <span className="hs-row-grip"><button type="button" aria-label={`เลื่อน ${link.title} ขึ้น`} data-tooltip={index===0?"รายการนี้อยู่บนสุดแล้ว":"เลื่อนรายการนี้ขึ้นหนึ่งตำแหน่ง"} disabled={busy||index===0} onClick={()=>void onReorder(index,-1)}><ChevronUp size={17}/></button><button type="button" aria-label={`เลื่อน ${link.title} ลง`} data-tooltip={index===total-1?"รายการนี้อยู่ท้ายสุดแล้ว":"เลื่อนรายการนี้ลงหนึ่งตำแหน่ง"} disabled={busy||index===total-1} onClick={()=>void onReorder(index,1)}><ChevronDown size={17}/></button></span>
        {rich?<button type="button" className="hs-row-icon hce-row-media" disabled={busy} aria-label={`แก้ไขรูปและเนื้อหา ${link.title}`} data-tooltip={`แก้ไข${option.short}`} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{media?<img src={media} alt=""/>:<ContentIcon size={22}/>}</button>:draft.type==="heading"?<span className="hs-row-icon"><Heading size={20}/></span>:<button type="button" className="hs-row-icon hs-row-icon-button" disabled={busy} aria-label={`เปลี่ยนไอคอนหรือรูป ${link.title}`} data-tooltip="เลือกไอคอนจากเว็บไซต์ ไอคอนสำเร็จรูป หรืออัปโหลดรูป" aria-expanded={mediaExpanded} onClick={()=>setMediaExpanded(!mediaExpanded)}><HubLinkIcon icon={draft.icon} url={draft.url} size={32}/></button>}
        <div className="hs-row-fields"><label><span className="hs-sr-only">{draft.type==="heading"?"ชื่อหัวข้อ":draft.type==="link"?"ชื่อลิงก์":"ชื่อรายการ"}</span><input className="hs-inline-title" value={draft.title} maxLength={100} required disabled={busy} placeholder="ชื่อรายการ" onChange={event=>setDraft({...draft,title:event.target.value})}/></label>{draft.type==="link"&&<label><span className="hs-sr-only">URL ปลายทาง</span><input className="hs-inline-url" value={draft.url} maxLength={2048} required disabled={busy} inputMode="url" placeholder="https://your-link.com" onChange={event=>setDraft({...draft,url:event.target.value})}/></label>}{draft.type!=="link"&&<span className="hce-block-kind"><ContentIcon size={13}/>{option.short}{draft.type==="gallery"?` · ${draft.content?.images?.length||0} รูป`:""}{draft.type==="service"&&draft.content?.price?` · ${draft.content.price}`:""}{promoPrice?` · ${formatThaiBaht(promoPrice.saleSatang)} · ลด ${promoPrice.discountPercent}%`:""}</span>}</div>
        <div className="hs-row-visibility"><span>{draft.enabled?"แสดง":"ซ่อน"}</span><button type="button" className="hs-switch" role="switch" aria-checked={draft.enabled} aria-label={`${draft.enabled?"ซ่อน":"เปิดใช้งาน"} ${link.title}`} data-tooltip={draft.enabled?"ซ่อนรายการนี้จากหน้าฮับหลังบันทึกและเผยแพร่":"แสดงรายการนี้บนหน้าฮับหลังบันทึกและเผยแพร่"} disabled={busy} onClick={()=>setDraft({...draft,enabled:!draft.enabled})}><span/></button></div>
      </div>
      {mediaExpanded&&draft.type==="link"&&<div className="hs-link-media-editor"><LinkMediaPicker pageId={pageId} value={draft.icon} url={draft.url} disabled={busy} onChange={icon=>setDraft(current=>({...current,icon}))} onUploadingChange={onUploadState}/></div>}
      {expanded&&draft.type==="link"&&<div className="hs-row-details hs-description-details"><label className="hs-field">คำอธิบายสั้น ๆ<input maxLength={220} value={draft.description} onChange={event=>setDraft({...draft,description:event.target.value})} placeholder="คลิกแล้วจะเจออะไร" disabled={busy}/></label></div>}
      {expanded&&rich&&<div className="hce-rich-fields"><ContentFields pageId={pageId} draft={draft} onChange={setDraft} disabled={busy} onUploadingChange={onUploadState} showTitle={false}/></div>}
      <div className="hs-row-bottom"><div>
        {rich&&<button type="button" disabled={busy} aria-expanded={expanded} aria-label={`แก้ไขเนื้อหา ${link.title}`} data-tooltip="แก้ไขรูป คำอธิบาย และปุ่มของรายการนี้" onClick={()=>setExpanded(!expanded)}><Settings2 size={17}/>{expanded?"พับรายละเอียด":"แก้ไขเนื้อหา"}</button>}
        {draft.type==="link"&&<button type="button" className="hs-media-toggle" data-tooltip="เปลี่ยนไอคอนของเว็บไซต์ หรือใส่รูปให้ลิงก์" disabled={busy} onClick={()=>setMediaExpanded(!mediaExpanded)} aria-expanded={mediaExpanded}><ImageIcon size={17}/>ไอคอน / รูปภาพ</button>}
        {hasBlockAction(link)&&<button type="button" className="hs-link-stats-button" data-tooltip={hasAnalyticsAccess?"ดูยอดคลิกปุ่มปลายทางของรายการนี้":"อัปเกรด Pro เพื่อดูสถิติของรายการนี้"} disabled={busy} aria-label={`ดูสถิติ ${link.title}`} onClick={()=>onStatistics(link.id)}><BarChart3 size={17}/>ดูสถิติ{!hasAnalyticsAccess&&<span className="hs-stats-pro-tag">PRO</span>}</button>}
        {draft.type==="link"&&<><button type="button" className={draft.featured?"hs-star-active":""} aria-pressed={draft.featured} data-tooltip={draft.featured?"ยกเลิกการเน้นลิงก์นี้":"เน้นลิงก์นี้ให้เด่นกว่ารายการอื่น"} disabled={busy} onClick={()=>setDraft({...draft,featured:!draft.featured})}><Sparkles size={17}/>ลิงก์เด่น</button><button type="button" data-tooltip="เพิ่มหรือแก้ไขคำอธิบายสั้น ๆ ของลิงก์" disabled={busy} onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}><Settings2 size={17}/>รายละเอียด</button></>}
        <button type="button" aria-label={`ทำสำเนา ${link.title}`} data-tooltip={!canDuplicate?"จำนวนรายการครบตามแพ็กเกจแล้ว":dirty?"บันทึกการแก้ไขก่อนทำสำเนา":"ทำสำเนาไปท้ายรายการ โดยเริ่มเป็นรายการที่ซ่อนอยู่"} disabled={busy||dirty||!canDuplicate} onClick={()=>void onDuplicate(link)}><Copy size={16}/><span>ทำสำเนา</span></button>
        <button type="button" aria-label={`เก็บ ${link.title} เข้าคลัง`} data-tooltip="เก็บรายการเข้าคลัง ประวัติคลิกยังอยู่และกู้คืนได้" disabled={busy} onClick={()=>setConfirm(!confirm)}><Archive size={16}/><span>เก็บเข้าคลัง</span></button>
      </div>{dirty?<span className="hs-row-unsaved" role="status">ยังไม่บันทึก</span>:<span className="hs-row-saved"><Check size={15}/>บันทึกแล้ว</span>}</div>
      {error&&<p className="hs-row-error" role="alert">{error}</p>}
    </form>
    {confirm&&<div className="hs-inline-confirm"><p>เก็บรายการนี้เข้าคลัง?<span>ประวัติคลิกยังอยู่ และกู้คืนได้ภายหลัง</span></p><div><button onClick={()=>setConfirm(false)} disabled={busy}>ยกเลิก</button><button className="hs-danger-text" disabled={busy} onClick={()=>void onArchive(link)}>เก็บเข้าคลัง</button></div></div>}
  </article>;
}
