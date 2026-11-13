"use client";

import {useCallback, useEffect, useState} from "react";
import {ArrowRight, Check, Clock3, Link2, LoaderCircle, RefreshCw, ShieldCheck, Users} from "lucide-react";
import type {InvitePreview} from "../../lib/hub-team-types";
import {teamApi,teamDate} from "./HubTeams";
import "../teams.css";

export default function HubInvitation({token,onDone,notify}:{token:string;onDone:()=>void;notify:(message:string)=>void}){
  const [invite,setInvite]=useState<InvitePreview|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{try{const value=await teamApi<InvitePreview>(`/api/team-invites/${encodeURIComponent(token)}`);setInvite(value);setError("");}catch(e){setInvite(null);setError((e as Error).message);}finally{setLoading(false);}},[token]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(invite?.status!=="pending")return;const timer=setInterval(()=>void load(),15000);const focused=()=>{if(document.visibilityState==="visible")void load();};document.addEventListener("visibilitychange",focused);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",focused);};},[invite?.status,load]);
  async function accept(){if(busy)return;setBusy(true);setError("");try{setInvite(await teamApi<InvitePreview>(`/api/team-invites/${encodeURIComponent(token)}`,{method:"POST",body:"{}"}));notify("ตอบรับคำเชิญแล้ว รอเจ้าของทีมอนุมัติ");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const expired=invite?.status==="expired"||invite?.status==="revoked";
  return <section className="ht-invitation-page"><div className="ht-invitation-card"><span className="ht-empty-icon"><Users size={33}/></span><p className="hs-kicker">คำเชิญร่วมงาน</p><h1>{invite?`ร่วมทีม ${invite.teamName}`:"เปิดคำเชิญของคุณ"}</h1>{loading?<div className="ht-loading"><LoaderCircle className="hs-spin" size={22}/>กำลังตรวจคำเชิญ</div>:<>
    {error&&<div className="ht-alert" role="alert">{error}</div>}
    {invite&&<><p className="ht-invitation-intro"><strong>{invite.ownerName}</strong> เชิญคุณมาช่วยดูแลฮับบน นากนะ HUB</p><div className="ht-invitation-hubs">{invite.pages.map(page=><div key={page.id}><Link2 size={17}/><span><strong>{page.title}</strong><small>/h/{page.slug}</small></span></div>)}</div><div className="ht-invitation-permission"><ShieldCheck size={20}/><span><strong>{invite.role==="editor"?"แก้ไขลิงก์ รูป และหน้าตาได้":"ดูสถิติตามแพ็กเกจของเจ้าของ"}</strong><small>{invite.role==="editor"?(invite.canPublish?"เผยแพร่การเปลี่ยนแปลงได้":"เจ้าของเป็นผู้เผยแพร่การเปลี่ยนแปลง"):"แก้ไขเนื้อหาและจัดการสมาชิกไม่ได้"}</small></span></div>
      {invite.isOwner&&!expired?<div className="ht-invitation-status"><ShieldCheck size={21}/><h2>คุณเป็นเจ้าของทีมนี้</h2><p>ส่งลิงก์นี้ให้ผู้ร่วมงานตอบรับด้วยบัญชี LINE ของเขา</p></div>:invite.status==="active"?<div className="ht-invitation-status ht-status-success"><Check size={24}/><h2>เข้าร่วมทีมแล้ว</h2><p>เจ้าของอนุมัติสิทธิ์ให้คุณแล้ว เปิดฮับที่ร่วมงานได้เลย</p></div>:invite.status==="pending"?<div className="ht-invitation-status"><Clock3 size={24}/><h2>รอเจ้าของทีมอนุมัติ</h2><p>ตอบรับสำเร็จแล้ว หน้านี้จะอัปเดตเมื่อได้รับอนุมัติ</p><button type="button" className="ht-text-button" onClick={()=>void load()}><RefreshCw size={16}/>ตรวจสถานะอีกครั้ง</button></div>:expired?<div className="ht-invitation-status"><Clock3 size={24}/><h2>{invite.status==="expired"?"คำเชิญนี้หมดอายุแล้ว":"คำเชิญนี้ถูกยกเลิกแล้ว"}</h2><p>ติดต่อเจ้าของทีมเพื่อรับลิงก์เชิญใหม่</p></div>:<><p className="ht-invitation-expiry">คำเชิญหมดอายุ {teamDate(invite.expiresAt)} · เวลาไทย</p><button type="button" className="hs-button hs-primary ht-accept-button" disabled={busy} onClick={()=>void accept()}>{busy?<LoaderCircle className="hs-spin" size={19}/>:<Check size={19}/>}ตอบรับคำเชิญ</button><small className="ht-invitation-footnote">เจ้าของทีมจะตรวจบัญชีที่ตอบรับก่อนเปิดสิทธิ์ให้คุณ</small></>}
    </>}
    {!invite&&error&&<button type="button" className="hs-button hs-outline" onClick={()=>{setLoading(true);void load();}}><RefreshCw size={17}/>ลองอีกครั้ง</button>}
    <button type="button" className={invite?.status==="active"?"hs-button hs-primary ht-accept-button":"ht-invitation-exit"} disabled={busy} onClick={onDone}>{invite?.status==="active"?"เปิดฮับที่ร่วมงาน":"ไปที่สตูดิโอของฉัน"}<ArrowRight size={17}/></button>
  </>}</div></section>;
}
