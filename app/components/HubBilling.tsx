"use client";

import {useEffect, useState} from "react";
import {ArrowRight, ArrowUpRight, Check, CheckCircle2, CreditCard, ExternalLink, Info, Layers, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Sparkles} from "lucide-react";
import type {HubPlan} from "../../lib/hub-types";
import type {BillingInterval, BillingStatus} from "../../lib/hub-billing-types";
import {HubBrand} from "./ui";
import "../billing.css";

const money = new Intl.NumberFormat("th-TH");
const statusNames: Record<string, string> = {active: "ใช้งานอยู่", trialing: "ช่วงทดลองใช้", past_due: "รอชำระเงิน", canceled: "สิ้นสุดสมาชิกแล้ว", unpaid: "ยังชำระเงินไม่สำเร็จ", incomplete: "รอยืนยันการชำระเงิน", incomplete_expired: "หมดเวลาชำระเงิน", paused: "พักสมาชิก"};
function dateLabel(value: number) {return new Intl.DateTimeFormat("th-TH", {day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok"}).format(value);}
async function billingRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "same-origin", signal, ...(body === undefined ? {} : {headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)})});
  const data = await response.json().catch(() => null) as (T & {error?: string}) | null;
  if (!response.ok || !data) throw new Error(data?.error || "โหลดข้อมูลการชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง");
  return data;
}
function goToStripe(value: string, kind: "checkout" | "portal") {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== (kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com")) throw new Error("ที่อยู่ชำระเงินไม่ถูกต้อง กรุณาลองใหม่");
  window.location.assign(url.href);
}

export default function HubBilling({accountPlan, onAccountRefresh}: {accountPlan: HubPlan; onAccountRefresh: () => Promise<unknown>}) {
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{revision: number; data: BillingStatus | null; error: string; returned: string}>({revision: -1, data: null, error: "", returned: ""});
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [actionError, setActionError] = useState("");
  const loading = result.revision !== revision;
  const data = loading ? null : result.data;
  const plan = data?.plan ?? accountPlan;
  const monthly = data?.prices.monthly ?? 149;
  const yearly = data?.prices.yearly ?? 1490;
  const annualSaving = monthly * 12 - yearly;
  const existingSubscription = !!data?.subscription && !["canceled", "incomplete_expired"].includes(data.subscription.status);

  useEffect(() => {
    const controller = new AbortController();
    const returned = new URLSearchParams(window.location.search).get("billing") ?? "";
    const sync = returned === "success" || returned === "portal" || revision > 0;
    void (async () => {
      let syncError = "";
      let value: BillingStatus;
      try {value = await billingRequest<BillingStatus>(sync ? "/api/billing/sync" : "/api/billing", sync ? {} : undefined, controller.signal);}
      catch (cause) {
        if (controller.signal.aborted) return;
        if (!sync) throw cause;
        syncError = cause instanceof Error ? cause.message : "ยังตรวจสอบสถานะล่าสุดไม่ได้";
        value = await billingRequest<BillingStatus>("/api/billing", undefined, controller.signal);
      }
      if (controller.signal.aborted) return;
      setResult({revision, data: value, error: syncError, returned});
      if (returned) window.history.replaceState(window.history.state, "", "/studio?section=billing");
      await onAccountRefresh();
    })().catch((cause: unknown) => {
      if (!controller.signal.aborted) setResult({revision, data: null, error: cause instanceof Error ? cause.message : "โหลดแพ็กเกจไม่สำเร็จ", returned});
    });
    return () => controller.abort();
  }, [revision, onAccountRefresh]);

  async function openStripe(kind: "checkout" | "portal") {
    if (busy || loading) return;
    setBusy(kind); setActionError("");
    try {
      const response = await billingRequest<{url: string}>(`/api/billing/${kind}`, kind === "checkout" ? {interval} : {});
      goToStripe(response.url, kind);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "ยังเปิด Stripe ไม่ได้ กรุณาลองใหม่");
      setBusy(null);
    }
  }

  return <section className="hb-billing" aria-label="แพ็กเกจและการชำระเงิน">
    <header className="hb-heading"><div><p className="hb-eyebrow">เติบโตในแบบของคุณ</p><h1>แพ็กเกจและการชำระเงิน</h1><p>เลือกพื้นที่ที่พอดีกับแบรนด์คุณ พร้อมดูแลสมาชิกได้ในที่เดียว</p></div><span className="hb-secure"><ShieldCheck size={18}/>{loading ? "กำลังตรวจสอบแพ็กเกจ" : data?.configured ? "ชำระเงินผ่าน Stripe" : "กำลังเตรียมระบบชำระเงิน"}</span></header>

    {loading && <div className="hb-loading" role="status"><LoaderCircle size={18} className="hs-spin"/>กำลังตรวจสอบแพ็กเกจของคุณ</div>}
    {result.returned === "cancelled" && !loading && <div className="hb-notice"><Info size={19}/><p>คุณกลับมาก่อนชำระเงินเสร็จ เลือกแพ็กเกจใหม่ได้เมื่อพร้อม</p></div>}
    {result.returned === "success" && !loading && <div className={`hb-notice ${data?.plan === "pro" ? "hb-notice-success" : ""}`} role="status">{data?.plan === "pro" ? <CheckCircle2 size={20}/> : <Info size={20}/>}<div><strong>{data?.plan === "pro" ? "Pro พร้อมใช้งานแล้ว" : "กำลังรอยืนยันการชำระเงิน"}</strong><p>{data?.plan === "pro" ? "ดูสถิติ รับสรุป LINE ซ่อนแบรนด์ท้ายหน้า และสร้างฮับเพิ่มได้แล้ว" : "สิทธิ์จะเปิดเมื่อระบบยืนยันจาก Stripe แล้ว หากเพิ่งชำระสำเร็จให้กดตรวจสอบสถานะอีกครั้ง"}</p></div></div>}
    {((!loading && result.error) || actionError) && <div className="hb-error" role="alert"><span>{actionError || result.error}</span><button type="button" onClick={() => {setActionError(""); setRevision(value => value + 1);}} disabled={!!busy}><RefreshCw size={15}/>ลองอีกครั้ง</button></div>}
    {data && !data.configured && <div className="hb-notice hb-unavailable"><Info size={20}/><div><strong>กำลังเตรียมระบบชำระเงิน</strong><p>{data.message || "ผู้ดูแลกำลังเชื่อมต่อ Stripe เมื่อพร้อมแล้วคุณจะอัปเกรดจากหน้านี้ได้"}</p><small>คุณยังใช้งานแพ็กเกจปัจจุบันได้ตามปกติ</small></div></div>}
    {data?.mode === "test" && <div className="hb-notice"><Info size={20}/><div><strong>โหมดทดสอบการชำระเงิน</strong><p>หน้านี้เชื่อมกับ Stripe สำหรับทดสอบ ยังไม่ใช่การรับชำระเงินจริงหรือการซื้อสิทธิ์ Pro</p></div></div>}

    {(data?.subscription || plan === "pro") && <section className="hb-membership" aria-label="สมาชิกปัจจุบัน">
      <div><span className="hb-membership-icon"><CreditCard size={23}/></span><div><p>แพ็กเกจปัจจุบัน</p><h2>{plan === "pro" ? "นากนะ HUB Pro" : "Starter ฟรี"}</h2>{data?.subscription ? <p><span className={`hb-sub-status ${data.subscription.status === "active" ? "is-active" : ""}`}>{statusNames[data.subscription.status] || "กำลังตรวจสอบสถานะ"}</span> · {data.subscription.interval === "year" ? "รายปี" : "รายเดือน"}</p> : <p>สิทธิ์ Pro ของบัญชีคุณ</p>}</div></div>
      <div className="hb-membership-detail">{data?.subscription && data.subscription.currentPeriodEnd > 0 && <p>{data.subscription.cancelAtPeriodEnd ? "ใช้สิทธิ์ได้ถึง" : data.subscription.status === "active" ? "รอบถัดไป" : "สิ้นสุดรอบปัจจุบัน"}<strong>{dateLabel(data.subscription.currentPeriodEnd)}</strong></p>}{data?.subscription?.cancelAtPeriodEnd && <small>ยกเลิกการต่ออายุแล้ว</small>}{data?.canManage && <button className="hb-button hb-button-outline" disabled={!!busy} onClick={() => void openStripe("portal")} data-tooltip="ดูใบเสร็จ เปลี่ยนวิธีชำระเงิน หรือยกเลิกการต่ออายุใน Stripe">{busy === "portal" ? <LoaderCircle size={16} className="hs-spin"/> : <ExternalLink size={16}/>}จัดการสมาชิก</button>}</div>
    </section>}

    <div className="hb-cycle-row"><div className="hb-cycle-copy"><h2>เลือกรอบชำระเงินของ Pro</h2><p>รายปีประหยัด ฿{money.format(annualSaving)} เทียบกับจ่ายรายเดือน 12 รอบ</p></div><div className="hb-cycle" role="group" aria-label="รอบการเรียกเก็บเงิน"><button type="button" aria-pressed={interval === "month"} className={interval === "month" ? "is-selected" : ""} onClick={() => setInterval("month")} disabled={!!busy}>รายเดือน</button><button type="button" aria-pressed={interval === "year"} className={interval === "year" ? "is-selected" : ""} onClick={() => setInterval("year")} disabled={!!busy}>รายปี<span>ประหยัด ฿{money.format(annualSaving)}</span></button></div></div>
    <div className="hb-plans">
      <article className={`hb-plan ${plan === "starter" ? "hb-current" : ""}`}>
        <div className="hb-plan-label"><span>STARTER</span>{plan === "starter" && <em><CheckCircle2 size={14}/>แพ็กเกจปัจจุบัน</em>}</div><h2>เริ่มต้นได้ครบ</h2><p>โปรไฟล์ส่วนตัว หรือแบรนด์ที่เพิ่งเริ่ม</p><div className="hb-price"><strong>ฟรี</strong><span>ใช้งานได้ต่อเนื่อง</span></div><p className="hb-price-note">ไม่ต้องเพิ่มบัตรเพื่อเริ่มใช้งาน</p>
        <ul><li><Check size={18}/><span><strong>1 ฮับ</strong> รวมทุกช่องทางของคุณ</span></li><li><Check size={18}/><span><strong>5 รายการ</strong> ต่อฮับ <small>รวมเนื้อหาทุกประเภท · แกลเลอรีนับ 1 รายการ</small></span></li><li><Check size={18}/><span>รูปภาพ แกลเลอรี และการ์ดสินค้า/บริการ</span></li><li><Check size={18}/><span>24 ธีมสำเร็จรูป พร้อมปรับสีและหน้าโปรไฟล์</span></li><li><Check size={18}/><span>เผยแพร่และแชร์ทุกช่องทางในลิงก์เดียว</span></li><li className="hb-plan-brand"><Info size={18}/><span>มีแบรนด์ นากนะ HUB ท้ายหน้าสาธารณะ</span></li></ul><div className="hb-free-foot"><CheckCircle2 size={18}/>{plan === "starter" ? "คุณกำลังใช้ Starter ฟรี" : "แพ็กเกจพื้นฐานสำหรับทุกบัญชี"}</div>
      </article>
      <article className="hb-plan hb-pro-plan">
        <div className="hb-plan-label"><span><Sparkles size={18}/>PRO</span><em>{plan === "pro" ? "แพ็กเกจปัจจุบัน" : "แบรนด์คุณเต็มพื้นที่"}</em></div><h2>รู้ผลทุกลิงก์ เติบโตได้ตรงจุด</h2><p>สำหรับแบรนด์ที่อยากรู้ว่าคนสนใจอะไร และนำข้อมูลไปใช้ต่อ</p><div className="hb-price" aria-live="polite" aria-atomic="true"><strong>฿{money.format(interval === "year" ? yearly : monthly)}</strong><span>/{interval === "year" ? "ปี" : "เดือน"}</span></div><p className="hb-price-note">{interval === "year" ? `จ่าย ฿${money.format(yearly)} ครั้งเดียวต่อปี · เฉลี่ย ฿${new Intl.NumberFormat("th-TH", {maximumFractionDigits: 2}).format(yearly / 12)} / เดือน` : "เรียกเก็บทุกเดือน ยกเลิกการต่ออายุได้"}</p>
        <ul><li className="hb-key-benefit"><CheckCircle2 size={18}/><span><strong>ซ่อนแบรนด์ นากนะ HUB</strong> ท้ายหน้า</span></li><li><Check size={18}/><span><strong>10 ฮับ</strong> แยกแบรนด์ ร้าน และแคมเปญ</span></li><li><Check size={18}/><span><strong>100 รายการ</strong> ต่อฮับ <small>รวมเนื้อหาทุกประเภท · แกลเลอรีนับ 1 รายการ</small></span></li><li><Check size={18}/><span>ทุกความสามารถของ Starter</span></li><li><Check size={18}/><span><strong>สถิติของทุกฮับและรายลิงก์</strong><small>ยอดเข้าชม คลิก อันดับ กราฟ และส่งออก CSV</small></span></li><li><Check size={18}/><span><strong>สรุปรายวันผ่าน LINE</strong><small>เลือกเวลารับสรุป พร้อมเทียบกับวันก่อน</small></span></li><li><Check size={18}/><span>จัดการสมาชิกและใบเสร็จผ่าน Stripe</span></li></ul>
        <button className="hb-button hb-button-primary" disabled={loading || !data?.configured || !!busy || plan === "pro" || existingSubscription} onClick={() => void openStripe("checkout")} data-tooltip={plan === "pro" ? "บัญชีนี้มีสิทธิ์ Pro อยู่แล้ว" : existingSubscription ? "มีสมาชิกเดิมอยู่ ใช้ปุ่มจัดการสมาชิกเพื่อดูหรือแก้ไขการชำระเงิน" : !data?.configured ? "จะเปิดอัปเกรดเมื่อผู้ดูแลเชื่อมต่อระบบชำระเงินเรียบร้อย" : "เปิดหน้าชำระเงินของ Stripe เพื่อตรวจยอดและยืนยันการสมัคร"}>{busy === "checkout" ? <LoaderCircle size={18} className="hs-spin"/> : plan === "pro" ? <CheckCircle2 size={18}/> : <ArrowUpRight size={18}/>} {busy === "checkout" ? "กำลังไปหน้าชำระเงิน…" : plan === "pro" ? "คุณใช้ Pro อยู่แล้ว" : existingSubscription ? "จัดการสมาชิกเดิมด้านบน" : data?.mode === "test" ? "ทดสอบ Checkout" : `เลือก Pro ${interval === "year" ? "รายปี" : "รายเดือน"}`}</button>
        <p className="hb-renew-note">{interval === "year" ? `฿${money.format(yearly)} ต่อปี` : `฿${money.format(monthly)} ต่อเดือน`} · ต่ออายุอัตโนมัติจนกว่าจะยกเลิก</p>
      </article>
    </div>

    <section className="hb-brand-preview" aria-label="ตัวอย่างซ่อนแบรนด์ท้ายหน้า"><div><span className="hb-feature-icon"><LockKeyhole size={20}/></span><h2>คนเห็นแบรนด์คุณเป็นหลัก</h2><p>Pro ซ่อนโลโก้ “นากนะ HUB” และข้อความท้ายหน้าสาธารณะ ชื่อฮับและโลโก้ของคุณยังแสดงตามที่ตั้งไว้</p><small>อัปเกรดแล้วไปที่ ออกแบบ → แบรนด์ท้ายหน้า เพื่อปิดและเผยแพร่</small></div><div className="hb-brand-comparison"><div><span>STARTER</span><div className="hb-mini-footer"><small>พื้นที่เล็ก ๆ ที่เป็นคุณ</small><HubBrand compact/></div></div><ArrowRight size={18}/><div><span>PRO</span><div className="hb-mini-footer hb-mini-clear"><CheckCircle2 size={24}/><strong>พื้นที่ของแบรนด์คุณ</strong><small>ไม่มีแบรนด์แพลตฟอร์มท้ายหน้า</small></div></div></div></section>

    <section className="hb-terms"><div><Layers size={20}/><h2>Pro เหมาะกับคุณเมื่อ…</h2></div><div className="hb-reasons"><p><strong>อยากให้คนจำแบรนด์คุณ</strong>ใช้ฮับเป็นหน้าร้านหรือนามบัตร โดยไม่มีโลโก้แพลตฟอร์มท้ายหน้า</p><p><strong>มีหลายโปรเจกต์ต้องดูแล</strong>สร้างฮับแยกแบรนด์ สาขา ผลงาน หรือแคมเปญ แล้วดูผลแต่ละหน้า</p><p><strong>อยากรู้ว่าอะไรพาคนไปต่อ</strong>ดูอันดับลิงก์ อัตราคลิก และแนวโน้ม พร้อมรับสรุป LINE ทุกวัน</p></div></section>
    <section className="hb-conditions" aria-label="เงื่อนไขสมาชิก"><h2>ก่อนสมัคร Pro</h2><ul><li>ชำระค่าบริการตามรอบที่เลือก และต่ออายุอัตโนมัติ ยอดรวมจะแสดงใน Stripe ก่อนยืนยัน</li><li>ยกเลิกการต่ออายุได้ใน “จัดการสมาชิก” และใช้สิทธิ์ต่อได้จนสิ้นสุดรอบที่ชำระแล้ว</li><li>เมื่อสิทธิ์ Pro สิ้นสุด การดูสถิติและส่งออก CSV จะล็อก สรุป LINE จะพัก และแบรนด์ท้ายหน้าจะกลับมา ข้อมูลและประวัติเดิมยังอยู่</li><li>หากใช้เกินโควตา Starter ต้องจัดรายการให้อยู่ในโควตาก่อนเพิ่มรายการใหม่ หรือกลับมาใช้ Pro</li></ul><a href="/billing/terms" target="_blank" rel="noopener">อ่านเงื่อนไขการสมัครและการชำระเงิน<ExternalLink size={14}/></a></section>
    <footer className="hb-footer"><span><ShieldCheck size={16}/>กรอกข้อมูลบัตรใน Stripe โดยตรง</span><button type="button" disabled={loading || !!busy} onClick={() => setRevision(value => value + 1)} data-tooltip="ตรวจสอบสถานะสมาชิกและการชำระเงินล่าสุดจาก Stripe"><RefreshCw size={14} className={loading ? "hs-spin" : ""}/>ตรวจสอบสถานะอีกครั้ง</button></footer>
  </section>;
}
