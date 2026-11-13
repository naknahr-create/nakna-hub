"use client";

import {ArrowRight, BarChart3, Check, Download, LockKeyhole, MessageCircle, MousePointer2, Sparkles} from "lucide-react";
import "../analytics-upgrade.css";

export default function HubAnalyticsUpgrade({onUpgrade, variant = "analytics", expired = false}: {
  onUpgrade: () => void;
  variant?: "analytics" | "line";
  expired?: boolean;
}) {
  const line = variant === "line";
  return <section className={`hu-upgrade ${line ? "hu-upgrade-compact" : ""}`} aria-labelledby={line ? "line-pro-title" : "analytics-pro-title"}>
    <div className="hu-upgrade-intro">
      <span className="hu-pro-badge"><Sparkles size={15}/>สำหรับสมาชิก Pro</span>
      <span className="hu-upgrade-icon" aria-hidden="true">{line ? <MessageCircle size={28}/> : <BarChart3 size={28}/>}</span>
      <h2 id={line ? "line-pro-title" : "analytics-pro-title"}>{line ? "สรุปผลของฮับ ส่งถึง LINE ทุกวัน" : "รู้ว่าคนสนใจลิงก์ไหน ด้วย Pro"}</h2>
      <p>{expired ? "สิทธิ์ดูสถิติของรอบที่ชำระไว้สิ้นสุดแล้ว กลับมาใช้ Pro เพื่อเปิดรายงานต่อได้" : line ? "ดูยอดเข้าชม ยอดคลิก และ 3 ลิงก์ยอดนิยม พร้อมเปรียบเทียบกับวันก่อน เลือกเวลารับสรุปได้เอง" : "ดูผลของทุกลิงก์ เปรียบเทียบแนวโน้ม และใช้ข้อมูลจริงเลือกสิ่งที่ควรโปรโมตต่อ"}</p>
    </div>
    {!line && <div className="hu-benefit-grid">
      <article><span><MousePointer2 size={21}/></span><h3>รู้ว่าลิงก์ไหนได้ผล</h3><p>ยอดเข้าชม ยอดคลิก อัตราคลิกต่อการเข้าชม และอันดับลิงก์ยอดนิยม</p></article>
      <article><span><Download size={21}/></span><h3>เปรียบเทียบและต่อยอด</h3><p>กราฟรายวัน แหล่งที่มา อุปกรณ์ และไฟล์ CSV สำหรับวิเคราะห์ต่อ</p></article>
      <article><span><MessageCircle size={21}/></span><h3>รับสรุปใน LINE</h3><p>รวมทุกฮับในบัญชี ส่งรายงานรายวันในเวลาที่คุณเลือก</p></article>
    </div>}
    <div className="hu-upgrade-action"><div><span>นากนะ HUB Pro</span><p><strong>฿149</strong> / เดือน</p><small>หรือ ฿1,490 / ปี · ประหยัด ฿298</small></div><button type="button" onClick={onUpgrade}>{line ? "เปิดสรุป LINE ด้วย Pro" : "ปลดล็อกสถิติด้วย Pro"}<ArrowRight size={19}/></button></div>
    <div className="hu-included"><span><Check size={14}/>ซ่อนแบรนด์ท้ายหน้า</span><span><Check size={14}/>10 ฮับ</span><span><Check size={14}/>100 รายการต่อฮับ</span></div>
    <p className="hu-history-note"><LockKeyhole size={16}/><span>ระบบยังเก็บยอดจากผู้เข้าชมไว้ต่อเนื่อง อัปเกรดแล้วดูประวัติที่เก็บไว้ได้ทันที การเข้าชมของเจ้าของฮับและพรีวิวไม่นับยอด</span></p>
  </section>;
}
