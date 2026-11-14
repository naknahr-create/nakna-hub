"use client";

import {useCallback, useEffect, useState} from "react";
import {ArrowUpRight, Bell, BellOff, Check, ChevronDown, Clock3, Eye, LoaderCircle, MessageCircle, RefreshCw, Send, ShieldCheck, X} from "lucide-react";
import HubAnalyticsUpgrade from "./HubAnalyticsUpgrade";
import "../line-notifications.css";

type LineSettings = {
  configured: boolean;
  entitlement: boolean;
  subscribed: boolean;
  connected: boolean;
  friendStatus: "friend" | "blocked" | "unknown";
  enabled: boolean;
  time: string;
  timezone: "Asia/Bangkok";
  officialAccountUrl: string | null;
  lastSentAt: number | null;
  lastStatus: string | null;
};
type LinePreview = {text: string; reportDate: string; periodLabel?: string};
type TestResult = {accepted: boolean; message: string; status: "accepted" | "retry" | "failed"};
const HOURS = Array.from({length: 24}, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {"Content-Type": "application/json", ...init?.headers},
    });
  } catch {
    throw new Error("เชื่อมต่อไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง");
  }
  let body: unknown;
  try {body = await response.json();} catch {throw new Error("ยังโหลดข้อมูลไม่ได้ กรุณาลองอีกครั้ง");}
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body ? body.error : null;
    const code = body && typeof body === "object" && "code" in body ? body.code : null;
    throw Object.assign(new Error(typeof error === "string" ? error : "ยังทำรายการไม่ได้ กรุณาลองอีกครั้ง"), {code});
  }
  return body as T;
}

function accountUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["line.me", "lin.ee"].includes(url.hostname)
      && !url.username && !url.password ? url.href : null;
  } catch {return null;}
}

function sentLabel(timestamp: number) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  }).format(new Date(timestamp));
}

export default function LineNotifications({hasAccess, onUpgrade, onAccountRefresh}: {hasAccess: boolean; onUpgrade: () => void; onAccountRefresh: () => Promise<unknown>}) {
  const [settings, setSettings] = useState<LineSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("09:00");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "preview" | "send" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticePending, setNoticePending] = useState(false);
  const [preview, setPreview] = useState<LinePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSendStatus, setPreviewSendStatus] = useState<"unsent" | "accepted" | "retry">("unsent");
  const [sendConfirm, setSendConfirm] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await request<LineSettings>("/api/line/settings");
      setSettings(data);
      setEnabled(data.enabled);
      setTime(data.time);
    } catch (e) {setError((e as Error).message);} finally {setLoading(false);}
  }, []);
  useEffect(() => {void load();}, [load]);

  const entitled = hasAccess && settings?.entitlement !== false;
  const ready = !!(entitled && settings?.configured && settings.connected && settings.friendStatus === "friend");
  const dirty = !!settings && (enabled !== settings.enabled || time !== settings.time);
  const friendUrl = accountUrl(settings?.officialAccountUrl ?? null);
  const hour = time.split(":")[0] || "09";
  const minute = time.split(":")[1] || "00";

  function handleError(cause: unknown) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "analytics_pro_required") {
      setSettings(previous => previous ? {...previous, entitlement: false, enabled: false} : previous);
      setPreview(null); setPreviewOpen(false); setSendConfirm(false); setEnabled(false);
      void onAccountRefresh().catch(() => {});
    }
    setError(cause instanceof Error ? cause.message : "ยังทำรายการไม่ได้ กรุณาลองอีกครั้ง");
  }

  async function unsubscribe() {
    if (busy || !settings?.subscribed) return;
    setBusy("save"); setError(""); setNotice("");
    try {
      const data = await request<LineSettings>("/api/line/settings", {method: "PATCH", body: JSON.stringify({enabled: false, time: settings.time})});
      setSettings(data); setEnabled(false); setNotice("ปิดการรับสรุป LINE แล้ว");
    } catch (cause) {handleError(cause);} finally {setBusy(null);}
  }

  async function save() {
    if (busy || !dirty) return;
    setBusy("save"); setError(""); setNotice(""); setNoticePending(false);
    try {
      const data = await request<LineSettings>("/api/line/settings", {
        method: "PATCH", body: JSON.stringify({enabled, time}),
      });
      setSettings(data); setEnabled(data.enabled); setTime(data.time);
      setNotice(data.enabled ? `เปิดสรุปรายวันแล้ว ส่งเวลา ${data.time} น. ตามเวลาไทย` : "ปิดสรุปรายวันแล้ว เปิดใหม่ได้ทุกเมื่อ");
    } catch (e) {handleError(e);} finally {setBusy(null);}
  }

  async function showPreview(forSending = false) {
    if (busy || !entitled) return;
    setBusy("preview"); setError(""); setNotice(""); setNoticePending(false); setSendConfirm(false); setPreviewSendStatus("unsent");
    try {
      const data = await request<LinePreview>("/api/line/preview");
      setPreview(data); setPreviewOpen(true); setSendConfirm(forSending);
    } catch (e) {handleError(e);} finally {setBusy(null);}
  }

  async function sendTest() {
    if (busy || !ready || !sendConfirm || !preview) return;
    setBusy("send"); setError(""); setNotice(""); setNoticePending(false);
    try {
      const result = await request<TestResult>("/api/line/test", {method: "POST", body: JSON.stringify({reportDate: preview.reportDate})});
      if (result.accepted || result.status === "retry") {
        const queued = !result.accepted && result.status === "retry";
        setNoticePending(queued);
        setNotice(result.message || (queued ? "รับคำขอไว้แล้ว กำลังรอส่งไปยัง LINE" : "LINE รับคำขอส่งข้อความแล้ว ลองเปิดดูในแชต นากนะ HUB"));
        setSendConfirm(false); setPreviewSendStatus(queued ? "retry" : "accepted");
      } else {
        setError(result.message || "ยังส่งข้อความไม่สำเร็จ กรุณาลองอีกครั้งภายหลัง");
      }
    } catch (e) {handleError(e);} finally {setBusy(null);}
  }

  const statusLabel = !settings ? loading ? "กำลังตรวจสอบ" : "ยังโหลดไม่ได้" : !entitled ? "สำหรับสมาชิก Pro" : !settings.configured ? "กำลังเตรียมบริการ"
    : !settings.connected ? "ยังไม่ได้เชื่อม LINE" : settings.friendStatus !== "friend" ? "รอเพิ่มเพื่อน"
    : settings.enabled ? "เปิดสรุปรายวันแล้ว" : "พร้อมใช้งาน";

  return <section className="ln-panel" aria-labelledby="line-notifications-title">
    <header className="ln-header">
      <span className="ln-brand-icon" aria-hidden="true"><MessageCircle size={25}/></span>
      <div><p className="ln-eyebrow">การแจ้งเตือน</p><h2 id="line-notifications-title">สรุปสถิติผ่าน LINE</h2><p>{!entitled ? "รายงานรายวันสำหรับสมาชิก Pro ตั้งเวลาและจัดการการรับข้อความได้เอง" : settings && !settings.configured ? "ดูสถานะบริการ และตั้งค่าการรับสรุปเมื่อพร้อมใช้งาน" : "ยอดเข้าชม คลิก และลิงก์ยอดนิยม ในแชตของคุณ"}</p></div>
      <span className={`ln-status ${ready ? "ln-status-ready" : ""}`}><i/>{statusLabel}</span>
    </header>

    {loading && !settings ? <div className="ln-loading"><LoaderCircle className="hs-spin" size={22}/><span>กำลังโหลดการตั้งค่า LINE</span></div> : <>
      {!entitled && <>
        <HubAnalyticsUpgrade variant="line" onUpgrade={onUpgrade}/>
        {settings?.subscribed && <div className="ln-pro-optout"><p><strong>การส่งรายงานพักไว้จนกว่าจะมีสิทธิ์ Pro</strong>คุณเคยเปิดรับสรุปเวลา {settings.time} น. ไว้ หากกลับมาใช้ Pro ระบบจะใช้การตั้งค่านี้ต่อ หรือเลือกปิดการรับสรุปได้ที่นี่</p><button type="button" className="ln-button ln-secondary" disabled={!!busy} onClick={() => void unsubscribe()}>{busy === "save" ? <LoaderCircle size={16} className="hs-spin"/> : <BellOff size={16}/>}ปิดการรับสรุป</button></div>}
      </>}
      {settings && entitled && <>
        {!ready && <div className="ln-connection-note">
          <ShieldCheck size={19}/>
          <div><strong>{!settings.configured ? "บริการสรุปผ่าน LINE ยังไม่เปิดใช้งาน" : !settings.connected ? "ใช้กับบัญชีที่เข้าสู่ระบบด้วย LINE" : "เพิ่มเพื่อนเพื่อรับสรุปของคุณ"}</strong>
            <p>{!settings.configured ? "เมื่อบริการพร้อม คุณเลือกเปิดรับสรุปได้ที่นี่ ระหว่างนี้ดูสถิติในสตูดิโอได้ตามปกติ" : !settings.connected ? "บัญชีนี้ยังไม่มี LINE ที่ยืนยันแล้ว ระบบจะส่งสรุปให้เจ้าของบัญชีที่เชื่อมต่อไว้เท่านั้น" : settings.friendStatus === "blocked" ? "ยังไม่ได้เพิ่มเพื่อน หรือบล็อกบัญชี นากนะ HUB อยู่ เพิ่มเพื่อนหรือปลดบล็อก แล้วตรวจสถานะอีกครั้ง" : "เพิ่มเพื่อน นากนะ HUB แล้วกดตรวจสถานะอีกครั้ง หากยังไม่อัปเดต ลองเข้าสู่ระบบด้วย LINE ใหม่"}</p>
            {settings.connected && settings.configured && <div className="ln-connection-actions">
              {friendUrl && <a className="ln-button ln-line-button" href={friendUrl} target="_blank" rel="noopener noreferrer">เพิ่มเพื่อน นากนะ HUB <ArrowUpRight size={15}/></a>}
              <button type="button" className="ln-link-button" onClick={() => void load()} disabled={loading || !!busy}><RefreshCw size={14} className={loading ? "hs-spin" : ""}/>ตรวจสถานะอีกครั้ง</button>
            </div>}
          </div>
        </div>}

        <div className="ln-benefits" aria-label="ข้อมูลในสรุปรายวัน"><span><Check size={15}/>ยอดเข้าชมและยอดคลิก</span><span><Check size={15}/>3 ลิงก์ยอดนิยม</span><span><Check size={15}/>เทียบกับวันก่อน</span></div>
        <div className="ln-toggle-row">
          <div><strong id="line-daily-label">รับสรุปรายวัน</strong><p id="line-daily-description">รวมผลจากทุกฮับในบัญชี ส่งถึง LINE ของคุณ</p></div>
          <div className="ln-toggle-control"><span aria-hidden="true">{enabled ? "เปิด" : "ปิด"}</span><button type="button" className="ln-switch" role="switch" aria-checked={enabled} aria-labelledby="line-daily-label" aria-describedby="line-daily-description" data-tooltip={ready ? "เลือกเปิดหรือปิด แล้วกดบันทึกการตั้งค่า" : "บริการต้องพร้อมและเพิ่มเพื่อน LINE ก่อนเปิดรับสรุป"} disabled={!!busy || (!ready && !enabled)} onClick={() => {setEnabled(value => !value); setNotice("");}}><span/></button></div>
        </div>
        <button type="button" className="ln-advanced-toggle" aria-expanded={advancedOpen}
          aria-controls="ln-advanced-settings" onClick={()=>setAdvancedOpen(value=>!value)}>
          <span><Clock3 size={17}/>ตั้งเวลาและดูตัวอย่าง</span>
          <span>{time} น.<ChevronDown size={16}/></span>
        </button>
        <div className={`ln-advanced-body ${advancedOpen?"is-open":""}`} id="ln-advanced-settings">
        <div className="ln-schedule">
          <div className="ln-schedule-label"><Clock3 size={18}/><div><strong>เวลาที่อยากรับสรุป</strong><span>สรุปข้อมูลเมื่อวาน · เวลาไทย</span></div></div>
          <div className="ln-time-fields"><label><span className="ln-sr-only">ชั่วโมง</span><select value={hour} disabled={!!busy || !enabled || !ready} onChange={event => {setTime(`${event.target.value}:${minute}`); setNotice("");}}>{HOURS.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={14}/></label><b>:</b><label><span className="ln-sr-only">นาที</span><select value={minute} disabled={!!busy || !enabled || !ready} onChange={event => {setTime(`${hour}:${event.target.value}`); setNotice("");}}>{MINUTES.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={14}/></label><span>น.</span></div>
        </div>
        <div className="ln-preview-actions"><button type="button" className="ln-link-button" data-tooltip="ดูข้อความสรุปก่อนส่ง โดยยังไม่ส่งไปยัง LINE" disabled={!!busy} onClick={() => void showPreview()}>{busy === "preview" ? <LoaderCircle className="hs-spin" size={16}/> : <Eye size={16}/>}ดูตัวอย่างจากข้อมูลจริง</button><button type="button" className="ln-link-button" data-tooltip="ดูตัวอย่างแล้วเลือกยืนยันส่ง 1 ข้อความถึงบัญชีของคุณ" disabled={!!busy || !ready} onClick={() => void showPreview(true)}><Send size={15}/>ส่งตัวอย่างไปยัง LINE</button></div>
        </div>
        <div className="ln-save-row"><p>{dirty ? <><span className="ln-unsaved-dot"/>มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</> : settings.enabled && ready ? <><Bell size={14}/>ส่งทุกวัน เวลา {settings.time} น.</> : <><BellOff size={14}/>ยังไม่ส่งสรุปอัตโนมัติ</>}</p><button type="button" className="ln-button ln-primary" disabled={!!busy || !dirty || (enabled && !ready)} onClick={() => void save()}>{busy === "save" ? <LoaderCircle className="hs-spin" size={16}/> : <Check size={16}/>}บันทึกการตั้งค่า</button></div>
      </>}

      {error && <div className="ln-feedback ln-error" role="alert"><span>{error}</span>{!settings && <button type="button" className="ln-link-button" disabled={loading} onClick={() => void load()}><RefreshCw size={14}/>ลองอีกครั้ง</button>}</div>}
      {notice && <div className={`ln-feedback ${noticePending ? "ln-pending" : "ln-success"}`} role="status">{noticePending ? <Clock3 size={16}/> : <Check size={16}/>}<span>{notice}</span></div>}

      {entitled && previewOpen && preview && <div className="ln-preview" aria-label="ตัวอย่างสรุปรายวัน">
        <div className="ln-preview-heading"><div><span>ตัวอย่างข้อความ</span><p>{preview.periodLabel || `ข้อมูลวันที่ ${preview.reportDate}`} · {previewSendStatus === "accepted" ? "LINE รับคำขอส่งแล้ว" : previewSendStatus === "retry" ? "รอ LINE รับข้อความ" : "ยังไม่ได้ส่ง"}</p></div><button type="button" className="ln-close" aria-label="ปิดตัวอย่างข้อความ" disabled={busy === "send"} onClick={() => {setPreviewOpen(false); setSendConfirm(false);}}><X size={18}/></button></div>
        <div className="ln-message"><span className="ln-message-avatar" aria-hidden="true">น</span><div><strong>นากนะ HUB</strong><p>{preview.text}</p></div></div>
        {sendConfirm && <div className="ln-send-confirm"><p>ส่งสรุปนี้ 1 ข้อความไปยัง LINE ที่คุณใช้เข้าสู่ระบบ<br/><span>การส่งตัวอย่างไม่เปิดสรุปรายวันอัตโนมัติ</span></p><div><button type="button" className="ln-button ln-secondary" disabled={!!busy} onClick={() => setSendConfirm(false)}>ยกเลิก</button><button type="button" className="ln-button ln-line-button" disabled={!!busy || !ready} onClick={() => void sendTest()}>{busy === "send" ? <LoaderCircle className="hs-spin" size={15}/> : <Send size={15}/>}ยืนยันส่ง 1 ข้อความ</button></div></div>}
      </div>}

      {settings && entitled && <footer className="ln-footnote"><span>ยอดคลิกนับเป็นครั้ง ไม่ใช่จำนวนคน · เปิดหรือปิดรับสรุปได้ทุกเมื่อ</span>{settings.lastSentAt && <span>LINE รับคำขอส่งล่าสุด {sentLabel(settings.lastSentAt)} น.</span>}{settings.lastStatus && ["failed", "retry", "pending"].includes(settings.lastStatus) && <span>การส่งล่าสุดยังไม่สำเร็จ ลองดูสถิติในสตูดิโอได้ก่อน</span>}</footer>}
    </>}
  </section>;
}
