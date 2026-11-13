"use client";

import {useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode} from 'react';
import {Activity, ArrowDownLeft, ArrowLeft, ArrowUpRight, BarChart3, Check, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Clock3, CreditCard, Eye, FileText, Globe2, LayoutDashboard, Link2, LoaderCircle, LockKeyhole, MessageSquareText, MousePointer2, Pause, Play, RefreshCw, Search, ShieldCheck, Users, X} from 'lucide-react';
import type {AdminAccount, AdminAudit, AdminHub, AdminList, AdminOverview, AdminRange} from '../../lib/hub-admin-types';
import {HubBrand} from './ui';
import '../admin.css';

type AdminTab = 'overview' | 'accounts' | 'hubs' | 'audit';
type AccountFilter = 'all' | 'starter' | 'pro';
type HubFilter = 'all' | 'published' | 'draft' | 'archived' | 'suspended';
type ActionDialog = {kind: 'note' | 'resolve'; account: AdminAccount} | {kind: 'suspend' | 'restore'; hub: AdminHub};
type Remote<T> = {key: string; data: T | null; error: ApiError | null};
const numbers = new Intl.NumberFormat('th-TH');
const money = new Intl.NumberFormat('th-TH', {style: 'currency', currency: 'THB', maximumFractionDigits: 2});
const dateFormat = new Intl.DateTimeFormat('th-TH', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok'});
const dateTimeFormat = new Intl.DateTimeFormat('th-TH', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'});
const shortDateFormat = new Intl.DateTimeFormat('th-TH', {day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok'});
const ranges: {value: AdminRange; label: string}[] = [{value: 'today', label: 'วันนี้'}, {value: '7d', label: '7 วัน'}, {value: '30d', label: '30 วัน'}, {value: 'all', label: 'ทั้งหมด'}];
const tabs: {value: AdminTab; label: string; description: string; icon: typeof Users}[] = [
  {value: 'overview', label: 'ภาพรวม', description: 'ดูภาพรวมแพลตฟอร์ม', icon: LayoutDashboard},
  {value: 'accounts', label: 'ผู้ใช้และสมาชิก', description: 'ค้นหาผู้ใช้และดูสถานะสมาชิก', icon: Users},
  {value: 'hubs', label: 'จัดการฮับ', description: 'ตรวจสอบและจัดการการเผยแพร่ฮับ', icon: Link2},
  {value: 'audit', label: 'ประวัติการจัดการ', description: 'ตรวจสอบรายการที่ผู้ดูแลทำไว้', icon: ClipboardList},
];

class ApiError extends Error {
  constructor(message: string, public status: number, public signInUrl?: string) {super(message);}
}
async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', ...init});
  const value = await response.json().catch(() => null) as (T & {error?: string; signInUrl?: string}) | null;
  if (!response.ok || value === null) throw new ApiError(value?.error || 'ยังโหลดข้อมูลไม่ได้ กรุณาลองอีกครั้ง', response.status, value?.signInUrl);
  return value;
}
function useRemote<T>(url: string | null, revision: number) {
  const key = `${url ?? ''}:${revision}`;
  const [state, setState] = useState<Remote<T>>({key: '', data: null, error: null});
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void apiRequest<T>(url, {signal: controller.signal}).then(data => {
      if (!controller.signal.aborted) setState({key, data, error: null});
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({key, data: null, error: error instanceof ApiError ? error : new ApiError('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', 0)});
    });
    return () => controller.abort();
  }, [url, key]);
  return {data: state.key === key ? state.data : null, error: state.key === key ? state.error : null, loading: !!url && state.key !== key};
}
function shortDay(date: string) {return shortDateFormat.format(new Date(`${date}T00:00:00+07:00`));}
function dateLabel(value: number) {return value > 0 ? dateFormat.format(value) : '—';}
function subscriptionLabel(account: AdminAccount) {
  const subscription = account.subscription;
  if (!subscription) return 'ยังไม่มีสมาชิกแบบชำระเงิน';
  const statuses: Record<string, string> = {active: 'ใช้งานอยู่', past_due: 'มีรายการชำระเงินที่ต้องตรวจสอบ', canceled: 'ยกเลิกแล้ว', unpaid: 'ชำระเงินไม่สำเร็จ', incomplete: 'รอชำระเงิน', incomplete_expired: 'รายการชำระเงินหมดอายุ', trialing: 'อยู่ระหว่างทดลองใช้', paused: 'พักสมาชิก'};
  return statuses[subscription.status] ?? 'ตรวจสอบสถานะการชำระเงิน';
}
function hubStatus(hub: AdminHub) {
  if (hub.suspended) return {label: 'พักการเผยแพร่', className: 'ha-badge-warning'};
  if (hub.archived) return {label: 'อยู่ในคลัง', className: 'ha-badge-neutral'};
  if (hub.published) return {label: 'เผยแพร่แล้ว', className: 'ha-badge-success'};
  return {label: 'ฉบับร่าง', className: 'ha-badge-neutral'};
}
function EmptyState({icon: Icon = Search, title, children}: {icon?: typeof Search; title: string; children?: ReactNode}) {
  return <div className="ha-empty"><span className="ha-empty-icon"><Icon size={25} aria-hidden="true" /></span><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
function LoadingState({label = 'กำลังโหลดข้อมูล'}: {label?: string}) {
  return <div className="ha-loading" role="status"><LoaderCircle className="ha-spin" size={24} aria-hidden="true" /><span>{label}</span></div>;
}
function ErrorState({error, retry}: {error: ApiError; retry: () => void}) {
  return <div className="ha-error" role="alert"><CircleHelp size={23} aria-hidden="true" /><div><h3>โหลดข้อมูลไม่สำเร็จ</h3><p>{error.message}</p></div><button className="ha-button" onClick={retry}><RefreshCw size={17} aria-hidden="true" />ลองอีกครั้ง</button></div>;
}
function Pagination({list, onPage}: {list: AdminList<unknown>; onPage: (page: number) => void}) {
  if (!list.total) return null;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  return <div className="ha-pagination"><span>{numbers.format((list.page - 1) * list.pageSize + 1)}–{numbers.format(Math.min(list.page * list.pageSize, list.total))} จาก {numbers.format(list.total)} รายการ</span><div><button className="ha-button ha-button-icon" disabled={list.page <= 1} onClick={() => onPage(list.page - 1)} aria-label="หน้าก่อนหน้า" title="หน้าก่อนหน้า"><ChevronLeft size={19} aria-hidden="true" /></button><span>หน้า {numbers.format(list.page)} / {numbers.format(pages)}</span><button className="ha-button ha-button-icon" disabled={list.page >= pages} onClick={() => onPage(list.page + 1)} aria-label="หน้าถัดไป" title="หน้าถัดไป"><ChevronRight size={19} aria-hidden="true" /></button></div></div>;
}
function Metric({icon: Icon, title, value, description, tone = 'teal'}: {icon: typeof Users; title: string; value: string; description: string; tone?: string}) {
  return <article className={`ha-metric ha-metric-${tone}`}><div className="ha-metric-top"><span>{title}</span><Icon size={21} aria-hidden="true" /></div><strong>{value}</strong><p>{description}</p></article>;
}
function TrafficChart({overview}: {overview: AdminOverview}) {
  const visibleDays = overview.range === 'all' ? overview.daily.slice(-30) : overview.daily;
  const [selectedDate, setSelectedDate] = useState('');
  const selected = visibleDays.find(day => day.date === selectedDate) ?? visibleDays.at(-1);
  const max = Math.max(1, ...visibleDays.flatMap(day => [day.views, day.clicks]));
  const hasTraffic = visibleDays.some(day => day.views || day.clicks);
  return <section className="ha-panel ha-chart-panel" aria-labelledby="ha-traffic-title"><div className="ha-panel-heading"><div><h2 id="ha-traffic-title">คนเข้ามา แล้วคลิกไปที่ไหน</h2><p>ยอดเปิดฮับและคลิกลิงก์ในแต่ละวัน · เวลาไทย</p></div><span className="ha-badge ha-badge-neutral"><Activity size={14} aria-hidden="true" />ข้อมูลจริง</span></div>
    <div className="ha-chart-legend"><span><i className="ha-dot ha-dot-views" />เข้าชม</span><span><i className="ha-dot ha-dot-clicks" />คลิก</span><small>{overview.range === 'all' ? 'กราฟ 30 วันที่มีข้อมูลล่าสุด' : 'เลือกแท่งกราฟเพื่อดูแต่ละวัน'}</small></div>
    {visibleDays.length > 0 ? <>
      <div className="ha-chart" role="group" aria-label="กราฟยอดเข้าชมและคลิกแต่ละวัน"><span className="ha-chart-scale">{numbers.format(max)}</span><div className="ha-chart-bars">{visibleDays.map(day => <button key={day.date} className={`ha-chart-day ${selected?.date === day.date ? 'is-selected' : ''}`} aria-pressed={selected?.date === day.date} aria-label={`${shortDay(day.date)} เข้าชม ${day.views} ครั้ง คลิก ${day.clicks} ครั้ง ผู้ใช้ใหม่ ${day.newAccounts} บัญชี`} title={`${shortDay(day.date)} · ${numbers.format(day.views)} เข้าชม · ${numbers.format(day.clicks)} คลิก`} onClick={() => setSelectedDate(day.date)}><span className="ha-chart-bar ha-chart-bar-views" style={{height: `${day.views / max * 100}%`} as CSSProperties} /><span className="ha-chart-bar ha-chart-bar-clicks" style={{height: `${day.clicks / max * 100}%`} as CSSProperties} /></button>)}</div></div>
      <div className="ha-chart-axis"><span>{shortDay(visibleDays[0].date)}</span>{visibleDays.length > 2 && <span>{shortDay(visibleDays[Math.floor(visibleDays.length / 2)].date)}</span>}{visibleDays.length > 1 && <span>{shortDay(visibleDays[visibleDays.length - 1].date)}</span>}</div>
      {selected && <div className="ha-chart-detail" aria-live="polite"><strong>{shortDay(selected.date)}</strong><span><i className="ha-dot ha-dot-views" />เข้าชม <b>{numbers.format(selected.views)}</b></span><span><i className="ha-dot ha-dot-clicks" />คลิก <b>{numbers.format(selected.clicks)}</b></span><span>ผู้ใช้ใหม่ <b>{numbers.format(selected.newAccounts)}</b></span><span>ฮับใหม่ <b>{numbers.format(selected.newPages)}</b></span></div>}
      {!hasTraffic && <p className="ha-helper ha-chart-note">ยังไม่มียอดเข้าชมหรือคลิกในช่วงนี้ ระบบยังเก็บเหตุการณ์ตามปกติเมื่อมีผู้เข้าชมจริง</p>}
    </> : <EmptyState icon={BarChart3} title="ยังไม่มีข้อมูลในช่วงนี้">เมื่อมีผู้เข้าชมฮับ กราฟจะแสดงข้อมูลที่นี่</EmptyState>}
    <p className="ha-helper ha-chart-note">ยอดเข้าชมและคลิกนับเป็นครั้ง ไม่ใช่จำนวนคน · การทดสอบจากบัญชีเจ้าของฮับไม่นับรวม</p>
  </section>;
}

const auditLabels: Record<AdminAudit['action'], string> = {suspend_hub: 'พักการเผยแพร่ฮับ', restore_hub: 'คืนการเผยแพร่ฮับ', update_account_note: 'แก้ไขโน้ตผู้ใช้', resolve_upgrade_request: 'ปิดรายการขออัปเกรด'};
function AuditItems({items, compact = false}: {items: AdminAudit[]; compact?: boolean}) {
  if (!items.length) return <EmptyState icon={ClipboardList} title="ยังไม่มีประวัติการจัดการ">เมื่อมีการแก้ไขโน้ตหรือจัดการฮับ ระบบจะบันทึกรายการไว้ที่นี่</EmptyState>;
  return <div className={`ha-audit-list ${compact ? 'ha-audit-compact' : ''}`}>{items.map(item => <article key={item.id} className="ha-audit-item"><span className={`ha-audit-mark ${item.action === 'suspend_hub' ? 'is-warning' : ''}`}>{item.action === 'suspend_hub' ? <Pause size={17} aria-hidden="true" /> : item.action === 'restore_hub' ? <Play size={17} aria-hidden="true" /> : <FileText size={17} aria-hidden="true" />}</span><div className="ha-audit-content"><strong>{auditLabels[item.action]}</strong><p>{item.targetLabel}</p>{!compact && <p className="ha-audit-reason">{item.reason || 'ไม่ได้ระบุข้อความเพิ่มเติม'}</p>}<small>โดย {item.actorName} · {dateTimeFormat.format(item.createdAt)} น.</small></div></article>)}</div>;
}
function AdminDialog({dialog, busy, error, onClose, onSubmit}: {dialog: ActionDialog; busy: boolean; error: string; onClose: () => void; onSubmit: (value: string) => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const fieldId = useId();
  const [value, setValue] = useState(dialog.kind === 'note' ? dialog.account.supportNote : '');
  const title = dialog.kind === 'note' ? 'โน้ตสำหรับดูแลผู้ใช้' : dialog.kind === 'resolve' ? 'ปิดรายการขออัปเกรด' : dialog.kind === 'suspend' ? 'พักการเผยแพร่ฮับนี้?' : 'คืนการเผยแพร่ฮับนี้?';
  const target = 'account' in dialog ? dialog.account.displayName : dialog.hub.title;
  const requiresReason = dialog.kind === 'suspend' || dialog.kind === 'restore';
  useEffect(() => {const element = ref.current;if (element && !element.open) element.showModal();return () => {if (element?.open) element.close();};}, []);
  function submit(event: FormEvent) {event.preventDefault();if (!busy && (!requiresReason || value.trim().length >= 3)) onSubmit(value.trim());}
  return <dialog ref={ref} className="ha-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => {event.preventDefault();if (!busy) onClose();}}><form onSubmit={submit}>
    <div className="ha-dialog-heading"><span className={`ha-dialog-icon ${dialog.kind === 'suspend' ? 'is-warning' : ''}`}>{dialog.kind === 'note' ? <MessageSquareText size={25} aria-hidden="true" /> : dialog.kind === 'resolve' ? <Check size={25} aria-hidden="true" /> : dialog.kind === 'suspend' ? <Pause size={25} aria-hidden="true" /> : <Play size={25} aria-hidden="true" />}</span><button type="button" className="ha-button ha-button-icon" onClick={onClose} disabled={busy} aria-label="ปิดหน้าต่าง" title="ปิดหน้าต่าง"><X size={20} aria-hidden="true" /></button></div><h2 id={titleId}>{title}</h2><p className="ha-dialog-target">{target}</p><p id={descriptionId} className="ha-dialog-description">{dialog.kind === 'note' ? 'ใช้บันทึกบริบทที่ช่วยดูแลบัญชีนี้ โน้ตจะแสดงเฉพาะในหลังบ้าน และมีประวัติการเปลี่ยนแปลง' : dialog.kind === 'resolve' ? 'ใช้เมื่อคุณดูแลคำขอของผู้ใช้เรียบร้อยแล้ว สถานะสมาชิกและรายการชำระเงินจะคงเดิม' : dialog.kind === 'suspend' ? 'ผู้เข้าชมจะเปิดฮับนี้ไม่ได้ชั่วคราว เนื้อหาและสถิติยังเก็บไว้ คุณคืนการเผยแพร่ได้ภายหลัง' : 'ยกเลิกการพักฮับ หากฮับนี้มีฉบับเผยแพร่อยู่ ผู้เข้าชมจะกลับมาเปิดได้ตามปกติ'}</p>
    {dialog.kind !== 'resolve' && <label className="ha-field" htmlFor={fieldId}><span>{dialog.kind === 'note' ? 'โน้ตภายใน' : 'เหตุผลที่บันทึกในประวัติ'}</span><textarea id={fieldId} value={value} onChange={event => setValue(event.target.value)} required={requiresReason} minLength={requiresReason ? 3 : undefined} maxLength={dialog.kind === 'note' ? 1000 : 500} rows={4} autoFocus placeholder={dialog.kind === 'note' ? 'เช่น ช่องทางติดต่อหรือเรื่องที่ต้องติดตาม' : 'ระบุเหตุผลอย่างน้อย 3 ตัวอักษร'} disabled={busy} /><small>{numbers.format(value.length)}/{dialog.kind === 'note' ? '1,000' : '500'} ตัวอักษร</small></label>}
    {error && <p className="ha-inline-error" role="alert">{error}</p>}<div className="ha-dialog-actions"><button type="button" className="ha-button" onClick={onClose} disabled={busy}>ยกเลิก</button><button className={`ha-button ${dialog.kind === 'suspend' ? 'ha-button-warning' : 'ha-button-primary'}`} type="submit" disabled={busy || (requiresReason && value.trim().length < 3)}>{busy ? <LoaderCircle size={17} className="ha-spin" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{dialog.kind === 'note' ? 'บันทึกโน้ต' : dialog.kind === 'resolve' ? 'ปิดรายการ' : dialog.kind === 'suspend' ? 'ยืนยันพักฮับ' : 'ยืนยันคืนการเผยแพร่'}</button></div>
  </form></dialog>;
}

export default function HubAdmin() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [range, setRange] = useState<AdminRange>('7d');
  const [revision, setRevision] = useState(0);
  const [accountQuery, setAccountQuery] = useState('');
  const [accountDraft, setAccountDraft] = useState('');
  const [accountPlan, setAccountPlan] = useState<AccountFilter>('all');
  const [accountPage, setAccountPage] = useState(1);
  const [hubQuery, setHubQuery] = useState('');
  const [hubDraft, setHubDraft] = useState('');
  const [hubFilter, setHubFilter] = useState<HubFilter>('all');
  const [hubPage, setHubPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [accessError, setAccessError] = useState<ApiError | null>(null);
  const overview = useRemote<AdminOverview>(`/api/operator?range=${range}`, revision);
  const authorized = !!overview.data && !accessError;
  const accountParams = new URLSearchParams({q: accountQuery, plan: accountPlan, page: String(accountPage)});
  const hubParams = new URLSearchParams({q: hubQuery, status: hubFilter, page: String(hubPage)});
  const accounts = useRemote<AdminList<AdminAccount>>(authorized && tab === 'accounts' ? `/api/operator/accounts?${accountParams}` : null, revision);
  const hubs = useRemote<AdminList<AdminHub>>(authorized && tab === 'hubs' ? `/api/operator/hubs?${hubParams}` : null, revision);
  const audit = useRemote<AdminList<AdminAudit>>(authorized && tab === 'audit' ? `/api/operator/audit?page=${auditPage}` : null, revision);
  const current = tab === 'accounts' ? accounts : tab === 'hubs' ? hubs : tab === 'audit' ? audit : overview;
  const authError = accessError ?? [overview.error, accounts.error, hubs.error, audit.error].find(error => error?.status === 401 || error?.status === 403) ?? null;
  const activeTab = tabs.find(item => item.value === tab)!;
  useEffect(() => {const requested = new URL(window.location.href).searchParams.get('tab');if (tabs.some(item => item.value === requested)) setTab(requested as AdminTab);}, []);
  useEffect(() => {if (!notice) return;const timer = setTimeout(() => setNotice(''), 6500);return () => clearTimeout(timer);}, [notice]);
  function navigate(value: AdminTab) {setTab(value);const url = new URL(window.location.href);url.searchParams.set('tab', value);window.history.replaceState(null, '', url);}
  function openDialog(value: ActionDialog) {setActionError('');setDialog(value);}
  function refresh() {setRevision(value => value + 1);}
  async function submitAction(value: string) {
    if (!dialog || busy) return;
    setBusy(true);setActionError('');
    try {
      const url = 'account' in dialog ? `/api/operator/accounts/${encodeURIComponent(dialog.account.id)}` : `/api/operator/hubs/${encodeURIComponent(dialog.hub.id)}`;
      const payload = dialog.kind === 'note' ? {supportNote: value} : dialog.kind === 'resolve' ? {resolveUpgradeRequest: true} : {suspended: dialog.kind === 'suspend', reason: value};
      await apiRequest(url, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      setNotice(dialog.kind === 'note' ? 'บันทึกโน้ตและประวัติเรียบร้อยแล้ว' : dialog.kind === 'resolve' ? 'ปิดรายการขออัปเกรดแล้ว' : dialog.kind === 'suspend' ? 'พักการเผยแพร่ฮับแล้ว เนื้อหาและสถิติยังอยู่ครบ' : 'คืนสถานะการเผยแพร่ฮับแล้ว');setDialog(null);refresh();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {setAccessError(error);setDialog(null);}
      else setActionError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
    } finally {setBusy(false);}
  }
  if (authError) {
    const signInUrl = authError.signInUrl?.startsWith('/') && !authError.signInUrl.startsWith('//') ? authError.signInUrl : '/studio';
    return <div className="ha-access"><a href="/" aria-label="นากนะ HUB หน้าแรก"><HubBrand /></a><section><span className="ha-access-icon"><LockKeyhole size={30} aria-hidden="true" /></span><p className="ha-eyebrow">หลังบ้านเจ้าของระบบ</p><h1>{authError.status === 401 ? 'เข้าสู่ระบบด้วยบัญชีเจ้าของ' : 'หน้านี้สำหรับเจ้าของระบบ'}</h1><p>{authError.status === 401 ? 'เข้าสู่ระบบก่อน เพื่อดูภาพรวมและจัดการนากนะ HUB' : 'บัญชีที่ใช้อยู่ยังไม่มีสิทธิ์ดูแลแพลตฟอร์ม คุณยังจัดการฮับของตัวเองได้ในสตูดิโอ'}</p><a className="ha-button ha-button-primary" href={authError.status === 401 ? signInUrl : '/studio'}><ArrowLeft size={18} aria-hidden="true" />{authError.status === 401 ? 'เข้าสู่ระบบ' : 'กลับสตูดิโอของฉัน'}</a></section></div>;
  }
  return <div className="ha-shell"><a className="hub-skip" href="#ha-main">ข้ามไปเนื้อหาหลัก</a>
    <aside className="ha-sidebar"><a className="ha-brand" href="/studio" aria-label="กลับสตูดิโอ นากนะ HUB"><HubBrand /></a><div className="ha-owner-label"><ShieldCheck size={18} aria-hidden="true" /><div><strong>เจ้าของระบบ</strong><span>จัดการนากนะ HUB</span></div></div><p className="ha-nav-label">หลังบ้านแพลตฟอร์ม</p><nav className="ha-navigation" aria-label="เมนูหลังบ้าน">{tabs.map(item => <button key={item.value} className={tab === item.value ? 'is-active' : ''} aria-current={tab === item.value ? 'page' : undefined} title={item.description} onClick={() => navigate(item.value)}><item.icon size={20} aria-hidden="true" /><span>{item.label}</span>{item.value === 'accounts' && !!overview.data?.totals.upgradeRequests && <b>{numbers.format(overview.data.totals.upgradeRequests)}</b>}</button>)}</nav><div className="ha-sidebar-bottom"><a className="ha-button" href="/studio"><ArrowLeft size={18} aria-hidden="true" />กลับสตูดิโอ</a><p><ShieldCheck size={15} aria-hidden="true" />เข้าถึงได้เฉพาะบัญชีที่ได้รับสิทธิ์</p></div></aside>
    <div className="ha-workspace"><header className="ha-topbar"><a className="ha-mobile-brand" href="/studio" aria-label="กลับสตูดิโอ"><HubBrand compact /></a><div className="ha-breadcrumb"><span>หลังบ้าน</span><ChevronRight size={15} aria-hidden="true" /><strong>{activeTab.label}</strong></div><span className="ha-owner-badge"><ShieldCheck size={15} aria-hidden="true" />เจ้าของระบบ</span></header>
    <main className="ha-main" id="ha-main"><div className="ha-page-heading"><div><p className="ha-eyebrow">NAKNA HUB · OWNER SPACE</p><h1>{tab === 'overview' ? 'เห็นภาพรวม ดูแลได้ตรงจุด' : activeTab.label}</h1><p>{tab === 'overview' ? 'ติดตามการเติบโต สมาชิก และการใช้งานของทุกฮับในที่เดียว' : tab === 'accounts' ? 'ดูสถานะสมาชิกและบันทึกเรื่องที่ต้องดูแลของแต่ละบัญชี' : tab === 'hubs' ? 'ตรวจสอบฮับที่เผยแพร่ และพักหรือคืนการเผยแพร่เมื่อจำเป็น' : 'ตรวจสอบว่าใครจัดการอะไร เมื่อไร และด้วยเหตุผลใด'}</p></div><button className="ha-button" onClick={refresh} disabled={overview.loading || current.loading} title="โหลดข้อมูลล่าสุดของหลังบ้าน"><RefreshCw size={18} className={overview.loading || current.loading ? 'ha-spin' : ''} aria-hidden="true" /><span>รีเฟรชข้อมูล</span></button></div>
      {overview.loading && <LoadingState label="กำลังตรวจสิทธิ์และโหลดภาพรวม" />}{overview.error && <ErrorState error={overview.error} retry={refresh} />}
      {authorized && overview.data && <>
        {tab === 'overview' && <><div className="ha-range-row"><div className="ha-range" role="group" aria-label="ช่วงเวลาของสถิติ">{ranges.map(item => <button key={item.value} className={range === item.value ? 'is-active' : ''} aria-pressed={range === item.value} onClick={() => setRange(item.value)}>{item.label}</button>)}</div><span><Clock3 size={15} aria-hidden="true" />ข้อมูลถึง {dateTimeFormat.format(overview.data.to)} น. · เวลาไทย</span></div>
          <section className="ha-metrics" aria-label="ตัวเลขภาพรวม"><Metric icon={Users} title="ผู้ใช้ทั้งหมด" value={numbers.format(overview.data.totals.accounts)} description={`ผู้ใช้ใหม่ ${numbers.format(overview.data.totals.newAccounts)} บัญชีในช่วงที่เลือก`} /><Metric icon={CreditCard} title="สมาชิก Pro ที่มีสิทธิ์ใช้งาน" value={numbers.format(overview.data.totals.paidAccounts)} description={`Starter ${numbers.format(overview.data.totals.starterAccounts)} บัญชี · สถานะปัจจุบัน`} tone="purple" /><Metric icon={Globe2} title="ฮับที่เผยแพร่" value={numbers.format(overview.data.totals.publishedPages)} description={`จากฮับทั้งหมด ${numbers.format(overview.data.totals.pages)} ฮับ · สถานะปัจจุบัน`} /><Metric icon={Eye} title="เข้าชมฮับ" value={numbers.format(overview.data.totals.views)} description="จำนวนครั้งในช่วงเวลาที่เลือก" tone="purple" /><Metric icon={MousePointer2} title="คลิกลิงก์" value={numbers.format(overview.data.totals.clicks)} description="จำนวนครั้งในช่วงเวลาที่เลือก" /><Metric icon={ArrowDownLeft} title="มูลค่าสมาชิกต่อเดือนโดยประมาณ" value={money.format(overview.data.totals.estimatedMrr)} description="เทียบแพ็กเกจรายปีเป็นรายเดือน · ไม่ใช่ยอดรับเงินจริง" tone="neutral" /></section>
          <div className="ha-status-strip"><button onClick={() => navigate('accounts')} title="ดูบัญชีผู้ใช้และรายการขออัปเกรด"><MessageSquareText size={18} aria-hidden="true" /><span>คำขออัปเกรดที่ยังไม่ปิด</span><strong>{numbers.format(overview.data.totals.upgradeRequests)}</strong><ChevronRight size={17} aria-hidden="true" /></button><button onClick={() => {setHubFilter('suspended');setHubPage(1);navigate('hubs');}} title="ดูฮับที่พักการเผยแพร่"><Pause size={18} aria-hidden="true" /><span>ฮับที่พักการเผยแพร่</span><strong>{numbers.format(overview.data.totals.suspendedPages)}</strong><ChevronRight size={17} aria-hidden="true" /></button></div>
          <TrafficChart overview={overview.data} /><div className="ha-overview-bottom"><section className="ha-panel"><div className="ha-panel-heading"><div><h2>ฮับที่คนคลิกมากที่สุด</h2><p>เรียงตามยอดคลิกในช่วงเวลาที่เลือก</p></div><button className="ha-text-button" onClick={() => navigate('hubs')}>ดูทุกฮับ<ChevronRight size={17} aria-hidden="true" /></button></div>{overview.data.topHubs.length ? <ol className="ha-top-hubs">{overview.data.topHubs.map((hub, index) => <li key={hub.id}><span className="ha-rank">{index + 1}</span><div><a href={`/h/${encodeURIComponent(hub.slug)}`} target="_blank" rel="noreferrer" title={`เปิดฮับ ${hub.title} ในแท็บใหม่`}>{hub.title}<ArrowUpRight size={14} aria-hidden="true" /></a><p>{hub.accountName} · /h/{hub.slug}</p></div><div className="ha-top-hub-count"><strong>{numbers.format(hub.clicks)} <small>คลิก</small></strong><span>{numbers.format(hub.views)} เข้าชม</span></div></li>)}</ol> : <EmptyState icon={MousePointer2} title="ยังไม่มีฮับที่มียอดคลิก">อันดับจะแสดงเมื่อมีคนคลิกลิงก์ในช่วงนี้</EmptyState>}</section><section className="ha-panel"><div className="ha-panel-heading"><div><h2>รายการจัดการล่าสุด</h2><p>ติดตามการเปลี่ยนแปลงของผู้ดูแล</p></div><button className="ha-text-button" onClick={() => navigate('audit')}>ดูทั้งหมด<ChevronRight size={17} aria-hidden="true" /></button></div><AuditItems items={overview.data.recentAudit} compact /></section></div>
          <p className="ha-footer-note"><CircleHelp size={16} aria-hidden="true" />มูลค่าสมาชิกเป็นค่าประมาณจากสมาชิกที่ชำระเงินและยังมีสิทธิ์ ใช้ราคาแพ็กเกจรายเดือน/รายปี ไม่รวมภาษี ส่วนลด เงินคืน หรือค่าธรรมเนียม</p>
        </>}
        {tab === 'accounts' && <section className="ha-panel ha-management"><div className="ha-panel-heading"><div><h2>บัญชีผู้ใช้ <span className="ha-count">{accounts.data ? numbers.format(accounts.data.total) : '—'}</span></h2><p>สิทธิ์ Pro ยืนยันจากการชำระเงิน สถิติในตารางเป็นยอดสะสม</p></div></div><div className="ha-filter-row"><form className="ha-search" role="search" onSubmit={event => {event.preventDefault();setAccountQuery(accountDraft.trim());setAccountPage(1);}}><label className="ha-visually-hidden" htmlFor="ha-account-search">ค้นหาผู้ใช้จากชื่อหรืออีเมล</label><Search size={19} aria-hidden="true" /><input id="ha-account-search" value={accountDraft} onChange={event => setAccountDraft(event.target.value)} placeholder="ค้นหาชื่อหรืออีเมล" maxLength={100} /><button type="submit">ค้นหา</button></form><label className="ha-filter"><span>แพ็กเกจ</span><select value={accountPlan} onChange={event => {setAccountPlan(event.target.value as AccountFilter);setAccountPage(1);}}><option value="all">ทุกแพ็กเกจ</option><option value="starter">Starter</option><option value="pro">Pro</option></select></label></div>
          {accounts.loading ? <LoadingState /> : accounts.error ? <ErrorState error={accounts.error} retry={refresh} /> : accounts.data && <>{accounts.data.items.length ? <div className="ha-table-scroll"><table className="ha-table ha-accounts-table"><thead><tr><th scope="col">ผู้ใช้</th><th scope="col">สมาชิกและการชำระเงิน</th><th scope="col">การใช้งานสะสม</th><th scope="col">การดูแล</th></tr></thead><tbody>{accounts.data.items.map(account => <tr key={account.id}><td data-label="ผู้ใช้"><div className="ha-person"><span className="ha-avatar">{Array.from(account.displayName.trim())[0]?.toUpperCase() || 'H'}</span><div><strong>{account.displayName}</strong><p>{account.email || 'บัญชี LINE'}</p><small>สมัคร {dateLabel(account.createdAt)}</small></div></div></td><td data-label="สมาชิก"><span className={`ha-badge ${account.analyticsAccess ? 'ha-badge-pro' : 'ha-badge-neutral'}`}>{account.analyticsAccess ? 'PRO' : 'STARTER'}</span><p className="ha-cell-title">{subscriptionLabel(account)}</p>{account.subscription && <><small>{account.subscription.interval === 'month' ? 'รายเดือน' : 'รายปี'} · สิทธิ์ถึง {dateLabel(account.subscription.paidUntil)}</small>{account.subscription.cancelAtPeriodEnd && <small className="ha-amber-text">ยกเลิกเมื่อสิ้นสุดรอบ</small>}</>}</td><td data-label="การใช้งาน"><div className="ha-use-stats"><span><Link2 size={15} aria-hidden="true" /><b>{numbers.format(account.pageCount)}</b> ฮับ <small>({numbers.format(account.publishedPages)} เผยแพร่)</small></span><span><Eye size={15} aria-hidden="true" /><b>{numbers.format(account.totalViews)}</b> เข้าชม</span><span><MousePointer2 size={15} aria-hidden="true" /><b>{numbers.format(account.totalClicks)}</b> คลิก</span></div></td><td data-label="การดูแล"><div className="ha-account-actions"><button className="ha-button ha-button-small" onClick={() => openDialog({kind: 'note', account})} title="อ่านหรือแก้ไขโน้ตภายในของบัญชีนี้"><MessageSquareText size={16} aria-hidden="true" />{account.supportNote ? 'ดู / แก้ไขโน้ต' : 'เพิ่มโน้ต'}</button>{account.upgradeRequested && <button className="ha-request-button" onClick={() => openDialog({kind: 'resolve', account})} title="ปิดคำขออัปเกรดที่ดูแลเรียบร้อยแล้ว"><Clock3 size={15} aria-hidden="true" />มีคำขออัปเกรด<ChevronRight size={15} aria-hidden="true" /></button>}</div>{account.supportNote && <p className="ha-note-preview" title={account.supportNote}>{account.supportNote}</p>}</td></tr>)}</tbody></table></div> : <EmptyState title="ไม่พบบัญชีที่ตรงกับการค้นหา">ลองเปลี่ยนชื่อ อีเมล หรือเลือกทุกแพ็กเกจ</EmptyState>}<Pagination list={accounts.data} onPage={setAccountPage} /></>}
        </section>}
        {tab === 'hubs' && <section className="ha-panel ha-management"><div className="ha-panel-heading"><div><h2>ฮับทั้งหมด <span className="ha-count">{hubs.data ? numbers.format(hubs.data.total) : '—'}</span></h2><p>พักการเผยแพร่ได้โดยเก็บเนื้อหาและสถิติเดิมไว้</p></div></div><div className="ha-filter-row"><form className="ha-search" role="search" onSubmit={event => {event.preventDefault();setHubQuery(hubDraft.trim());setHubPage(1);}}><label className="ha-visually-hidden" htmlFor="ha-hub-search">ค้นหาชื่อฮับ ลิงก์ หรือเจ้าของ</label><Search size={19} aria-hidden="true" /><input id="ha-hub-search" value={hubDraft} onChange={event => setHubDraft(event.target.value)} placeholder="ค้นหาชื่อฮับ ลิงก์ หรือเจ้าของ" maxLength={100} /><button type="submit">ค้นหา</button></form><label className="ha-filter"><span>สถานะ</span><select value={hubFilter} onChange={event => {setHubFilter(event.target.value as HubFilter);setHubPage(1);}}><option value="all">ทุกสถานะ</option><option value="published">เผยแพร่แล้ว</option><option value="draft">ฉบับร่าง</option><option value="suspended">พักการเผยแพร่</option><option value="archived">อยู่ในคลัง</option></select></label></div>
          {hubs.loading ? <LoadingState /> : hubs.error ? <ErrorState error={hubs.error} retry={refresh} /> : hubs.data && <>{hubs.data.items.length ? <div className="ha-table-scroll"><table className="ha-table ha-hubs-table"><thead><tr><th scope="col">ฮับและเจ้าของ</th><th scope="col">สถานะ</th><th scope="col">สถิติสะสม</th><th scope="col">จัดการ</th></tr></thead><tbody>{hubs.data.items.map(hub => {const status = hubStatus(hub);return <tr key={hub.id}><td data-label="ฮับ"><strong className="ha-hub-title">{hub.title}</strong><p className="ha-hub-slug">/h/{hub.slug}</p><small>เจ้าของ {hub.accountName}</small></td><td data-label="สถานะ"><span className={`ha-badge ${status.className}`}>{status.label}</span><small className="ha-block">แก้ไข {dateLabel(hub.updatedAt)}</small>{hub.suspended && hub.suspensionReason && <p className="ha-suspension-reason">{hub.suspensionReason}</p>}</td><td data-label="สถิติสะสม"><div className="ha-use-stats"><span><Eye size={15} aria-hidden="true" /><b>{numbers.format(hub.totalViews)}</b> เข้าชม</span><span><MousePointer2 size={15} aria-hidden="true" /><b>{numbers.format(hub.totalClicks)}</b> คลิก</span></div></td><td data-label="จัดการ"><div className="ha-hub-actions">{hub.published && !hub.suspended && !hub.archived && <a className="ha-button ha-button-small" href={`/h/${encodeURIComponent(hub.slug)}`} target="_blank" rel="noreferrer" title="เปิดฮับที่เผยแพร่ในแท็บใหม่"><ArrowUpRight size={17} aria-hidden="true" />เปิดฮับ</a>}<button className={`ha-button ha-button-small ${hub.suspended ? 'ha-button-outline-primary' : 'ha-button-outline-warning'}`} onClick={() => openDialog({kind: hub.suspended ? 'restore' : 'suspend', hub})} title={hub.suspended ? 'ยกเลิกการพักและคืนสถานะฮับ' : 'พักการเผยแพร่โดยเก็บเนื้อหาและสถิติไว้'}>{hub.suspended ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}{hub.suspended ? 'คืนการเผยแพร่' : 'พักฮับ'}</button></div></td></tr>;})}</tbody></table></div> : <EmptyState icon={Link2} title="ไม่พบฮับในรายการนี้">ลองเปลี่ยนคำค้นหาหรือเลือกทุกสถานะ</EmptyState>}<Pagination list={hubs.data} onPage={setHubPage} /></>}
        </section>}
        {tab === 'audit' && <section className="ha-panel ha-management"><div className="ha-panel-heading"><div><h2>บันทึกการจัดการ <span className="ha-count">{audit.data ? numbers.format(audit.data.total) : '—'}</span></h2><p>เรียงจากรายการล่าสุด · เวลาไทย</p></div><span className="ha-badge ha-badge-neutral"><ShieldCheck size={14} aria-hidden="true" />ตรวจสอบย้อนหลัง</span></div>{audit.loading ? <LoadingState /> : audit.error ? <ErrorState error={audit.error} retry={refresh} /> : audit.data && <><AuditItems items={audit.data.items} /><Pagination list={audit.data} onPage={setAuditPage} /></>}</section>}
      </>}
      <footer className="ha-footer"><span>นากนะ HUB · หลังบ้านเจ้าของระบบ</span><a href="/studio">กลับไปจัดการฮับของฉัน<ArrowUpRight size={15} aria-hidden="true" /></a></footer>
    </main></div>
    {notice && <div className="ha-toast" role="status"><Check size={19} aria-hidden="true" /><span>{notice}</span><button onClick={() => setNotice('')} title="ปิดข้อความ" aria-label="ปิดข้อความ"><X size={18} aria-hidden="true" /></button></div>}
    {dialog && <AdminDialog key={dialog.kind + ('account' in dialog ? dialog.account.id : dialog.hub.id)} dialog={dialog} busy={busy} error={actionError} onClose={() => {if (!busy) setDialog(null);}} onSubmit={submitAction} />}
  </div>;
}
