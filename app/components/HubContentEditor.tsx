"use client";

import {ArrowDown, ArrowUp, ArrowUpRight, Check, GalleryHorizontalEnd, Heading, Image as ImageIcon, Layers3, Link2, Package, BadgePercent, Share2, Type, X} from "lucide-react";
import type {HubBlockContent, HubContentType, HubLink, HubProfile} from "../../lib/hub-types";
import {HUB_GALLERY_LIMIT} from "../../lib/hub-content";
import {formatThaiBaht,getPromotionPricing} from "../../lib/hub-promotion";
import HubMediaUpload from "./HubMediaUpload";
import LinkMediaPicker from "./LinkMediaPicker";
import "../content-editor.css";

export type ContentDraft = Pick<HubLink,"type"|"title"|"description"|"url"|"icon"|"enabled"|"featured"|"content">;

export const CONTENT_OPTIONS = [
  {type:"image",label:"รูปภาพ / แบนเนอร์",short:"รูปภาพ",description:"ภาพใหญ่พร้อมเรื่องราวและปุ่ม",icon:ImageIcon,color:"peach"},
  {type:"gallery",label:"แกลเลอรี / ผลงาน",short:"แกลเลอรี",description:"รวมรูปสินค้า สถานที่ หรือผลงาน",icon:GalleryHorizontalEnd,color:"purple"},
  {type:"service",label:"สินค้า / บริการ",short:"สินค้า / บริการ",description:"รูป รายละเอียด ราคา และปุ่มติดต่อ",icon:Package,color:"blue"},
  {type:"promotion",label:"สินค้าลดราคา / Affiliate",short:"สินค้าลดราคา",description:"ระบุราคาเดิม ราคาหลังลด และลิงก์ซื้อ",icon:BadgePercent,color:"peach"},
  {type:"link",label:"ลิงก์",short:"ลิงก์",description:"เว็บไซต์ โซเชียล หรือช่องทางติดต่อ",icon:Link2,color:"teal"},
  {type:"text",label:"ข้อความ",short:"ข้อความ",description:"แนะนำธุรกิจหรือเล่าเรื่องของคุณ",icon:Type,color:"sand"},
  {type:"heading",label:"หัวข้อแบ่งหมวด",short:"หัวข้อ",description:"แบ่งเนื้อหาให้อ่านและเลือกดูง่าย",icon:Heading,color:"slate"},
] as const;

export function emptyContent(type:HubContentType):ContentDraft {
  const content:HubBlockContent = type === "gallery" ? {images:[],galleryLayout:"grid",buttonLabel:"ดูเพิ่มเติม"} : type === "promotion" ? {imageUrl:"",alt:"",aspectRatio:"square",fit:"contain",buttonLabel:"ดูสินค้า / ซื้อเลย",originalPrice:"",salePrice:""} : type === "image" || type === "service" ? {imageUrl:"",alt:"",aspectRatio:type === "image" ? "auto" : "landscape",fit:"contain",buttonLabel:type === "service" ? "สอบถามรายละเอียด" : "ดูเพิ่มเติม"} : {};
  return {type,title:"",description:"",url:"",icon:type === "link" ? "auto" : "link",enabled:true,featured:false,...(Object.keys(content).length ? {content} : {})};
}

export function contentDraftOf(link:HubLink):ContentDraft {
  return {type:link.type,title:link.title,description:link.description,url:link.url,icon:link.icon,enabled:link.enabled,featured:link.featured,...(link.content ? {content:link.content} : {})};
}

export function contentDraftError(draft:ContentDraft):string {
  if (!draft.title.trim()) return "ใส่ชื่อรายการก่อนบันทึก";
  if (draft.type === "text" && !draft.description.trim()) return "ใส่ข้อความที่อยากแสดงบนฮับ";
  if (draft.type === "image" && !draft.content?.imageUrl) return "เลือกรูปสำหรับรายการนี้ก่อนบันทึก";
  if (draft.type === "promotion") {
    if (!draft.content?.imageUrl) return "เพิ่มรูปสินค้าลดราคาก่อนบันทึก";
    if (!getPromotionPricing(draft.content?.originalPrice,draft.content?.salePrice)) return "ราคาปกติต้องมากกว่าราคาหลังลด และเป็นตัวเลขจำนวนเงินบาท";
    if (!draft.url.trim()) return "ใส่ลิงก์สินค้า / Affiliate ก่อนบันทึก";
    if (!/^https?:\/\//i.test(draft.url.trim())) return "ลิงก์สินค้าต้องขึ้นต้นด้วย https:// หรือ http://";
  }
  if (draft.type === "gallery" && !draft.content?.images?.length) return "เพิ่มรูปในแกลเลอรีอย่างน้อย 1 รูป";
  if (draft.type === "link" && !draft.url.trim()) return "ใส่ลิงก์ปลายทางก่อนบันทึก";
  if (draft.url.trim()) {
    try {const url=new URL(draft.url.trim());if(!["https:","http:","mailto:"].includes(url.protocol)||url.username||url.password)throw new Error();}
    catch {return "ใส่ URL เต็มที่เริ่มด้วย https://, http:// หรือ mailto:";}
  }
  return "";
}

export function ContentTypePicker({onChoose,onClose,disabled=false}:{onChoose:(type:HubContentType)=>void;onClose:()=>void;disabled?:boolean}) {
  return <section className="hce-picker" aria-labelledby="content-picker-heading">
    <div className="hce-picker-heading"><div><span className="hce-eyebrow"><Layers3 size={15}/>เล่าเรื่องในแบบของคุณ</span><h3 id="content-picker-heading">อยากเพิ่มอะไรในฮับ?</h3><p>เลือกเนื้อหา แล้วให้ธีมจัดหน้าตาให้</p></div><button type="button" aria-label="ปิดตัวเลือกเนื้อหา" onClick={onClose} disabled={disabled}><X size={20}/></button></div>
    <div className="hce-type-grid" role="group" aria-label="ประเภทเนื้อหาที่เพิ่มได้">{CONTENT_OPTIONS.map(option=>{const Icon=option.icon;return <button key={option.type} type="button" className={`hce-type hce-tone-${option.color}`} disabled={disabled} onClick={()=>onChoose(option.type)}><span className="hce-type-icon"><Icon size={23}/></span><span><strong>{option.label}</strong><small>{option.description}</small></span><ArrowUpRight size={17} className="hce-type-arrow"/></button>;})}</div>
    <p className="hce-picker-note"><Check size={15}/>ทุกแบบใช้สีและสไตล์จากธีมของคุณ · 1 บล็อกนับเป็น 1 รายการ</p>
  </section>;
}

type FieldsProps={pageId:string;draft:ContentDraft;onChange:(draft:ContentDraft)=>void;disabled:boolean;onUploadingChange:(uploading:boolean)=>void;showTitle?:boolean;autoFocus?:boolean};

export function ContentFields({pageId,draft,onChange,disabled,onUploadingChange,showTitle=true,autoFocus=false}:FieldsProps) {
  const option=CONTENT_OPTIONS.find(item=>item.type===draft.type)!;
  const content=draft.content || {};
  const images=content.images || [];
  const rich=["image","gallery","service","promotion"].includes(draft.type);
  const promo=getPromotionPricing(content.originalPrice,content.salePrice);
  function setContent(patch:Partial<HubBlockContent>) {onChange({...draft,content:{...content,...patch}});}
  function moveImage(index:number,delta:number) {const next=[...images];[next[index],next[index+delta]]=[next[index+delta],next[index]];setContent({images:next});}
  return <div className="hce-fields">
    {showTitle&&<label className="hs-field">{draft.type === "service"||draft.type === "promotion" ? "ชื่อสินค้า / บริการ" : draft.type === "heading" ? "ชื่อหัวข้อ" : "ชื่อรายการ"}<input required autoFocus={autoFocus} maxLength={100} disabled={disabled} value={draft.title} onChange={event=>onChange({...draft,title:event.target.value})} placeholder={draft.type === "promotion" ? "เช่น กระเป๋าสะพายลดราคาพิเศษ" : draft.type === "service" ? "เช่น บริการออกแบบเว็บไซต์" : draft.type === "gallery" ? "เช่น ผลงานที่เราอยากให้รู้จัก" : draft.type === "image" ? "เช่น ทำความรู้จักแบรนด์ของเรา" : draft.type === "heading" ? "เช่น ช่องทางติดต่อ" : "ใส่ชื่อที่คนอ่านแล้วเข้าใจ"}/></label>}

    {draft.type === "link"&&<><label className="hs-field">ลิงก์ปลายทาง<input required inputMode="url" maxLength={2048} disabled={disabled} value={draft.url} onChange={event=>onChange({...draft,url:event.target.value})} placeholder="https://"/></label><label className="hs-field">คำอธิบายสั้น ๆ <span className="hce-optional">ไม่จำเป็น</span><input maxLength={220} disabled={disabled} value={draft.description} onChange={event=>onChange({...draft,description:event.target.value})} placeholder="คลิกแล้วจะเจออะไร"/></label><LinkMediaPicker pageId={pageId} value={draft.icon} url={draft.url} disabled={disabled} onChange={icon=>onChange({...draft,icon})} onUploadingChange={onUploadingChange}/></>}

    {(draft.type === "image"||draft.type === "service"||draft.type === "promotion")&&<div className="hce-image-fields"><HubMediaUpload pageId={pageId} value={content.imageUrl||""} onChange={imageUrl=>setContent({imageUrl})} disabled={disabled} onUploadingChange={onUploadingChange} label={draft.type === "promotion" ? "รูปสินค้าลดราคา" : draft.type === "service" ? "รูปสินค้า / บริการ" : "ภาพที่จะแสดง"} hint={draft.type === "promotion" ? "รูปสินค้าจริงที่มีสิทธิ์ใช้งาน · แนะนำภาพสี่เหลี่ยม 1:1" : draft.type === "service" ? "รูปจริงช่วยให้คนเข้าใจบริการได้เร็วขึ้น · จะเพิ่มภายหลังก็ได้" : "เลือกรูปแนวนอน สี่เหลี่ยม หรือแนวตั้งได้ ระบบจัดให้ตามธีม"}/>{content.imageUrl&&<><label className="hs-field hce-alt-field">คำอธิบายภาพ <span className="hce-optional">สำหรับผู้อ่านหน้าจอ</span><input maxLength={200} disabled={disabled} value={content.alt||""} onChange={event=>setContent({alt:event.target.value})} placeholder="เช่น ทีมงานกำลังแนะนำสินค้าให้ลูกค้า"/><small>ถ้าเว้นไว้ ระบบจะใช้ชื่อรายการเป็นคำอธิบายภาพ</small></label><div className="hs-form-columns"><label className="hs-field">สัดส่วนภาพ<select disabled={disabled} value={content.aspectRatio||"auto"} onChange={event=>setContent({aspectRatio:event.target.value as HubBlockContent["aspectRatio"]})}><option value="auto">ตามรูปต้นฉบับ</option><option value="landscape">แนวนอน 16:9</option><option value="square">สี่เหลี่ยม 1:1</option><option value="portrait">แนวตั้ง 4:5</option></select></label><label className="hs-field">การวางภาพ<select disabled={disabled} value={content.fit||"contain"} onChange={event=>setContent({fit:event.target.value as HubBlockContent["fit"]})}><option value="contain">แสดงรูปครบ</option><option value="cover">เต็มกรอบ อาจตัดขอบภาพ</option></select></label></div></>}</div>}

    {draft.type === "gallery"&&<section className="hce-gallery-editor" aria-label="รูปในแกลเลอรี"><div className="hce-field-heading"><strong>รูปในแกลเลอรี</strong><span>{images.length}/{HUB_GALLERY_LIMIT} รูป</span></div>{images.length>0&&<div className="hce-gallery-items">{images.map((image,index)=><article key={image.url} className="hce-gallery-item"><img src={image.url} alt={image.alt||`รูปที่ ${index+1}`}/><div className="hce-gallery-item-copy"><strong>รูปที่ {index+1}</strong><label className="hs-field"><span className="hs-sr-only">คำบรรยายรูปที่ {index+1}</span><input maxLength={240} disabled={disabled} placeholder="คำบรรยายภาพ (ไม่จำเป็น)" value={image.caption||""} onChange={event=>setContent({images:images.map((item,i)=>i===index?{...item,caption:event.target.value}:item)})}/></label><details><summary>คำอธิบายภาพสำหรับผู้อ่านหน้าจอ</summary><label className="hs-field"><span className="hs-sr-only">คำอธิบายรูปที่ {index+1}</span><input maxLength={200} disabled={disabled} value={image.alt} placeholder="บอกสิ่งที่อยู่ในภาพ" onChange={event=>setContent({images:images.map((item,i)=>i===index?{...item,alt:event.target.value}:item)})}/></label></details></div><div className="hce-gallery-item-actions"><button type="button" aria-label={`เลื่อนรูปที่ ${index+1} ขึ้น`} data-tooltip="เลื่อนรูปขึ้น" disabled={disabled||index===0} onClick={()=>moveImage(index,-1)}><ArrowUp size={16}/></button><button type="button" aria-label={`เลื่อนรูปที่ ${index+1} ลง`} data-tooltip="เลื่อนรูปลง" disabled={disabled||index===images.length-1} onClick={()=>moveImage(index,1)}><ArrowDown size={16}/></button><button type="button" aria-label={`นำรูปที่ ${index+1} ออกจากแกลเลอรี`} data-tooltip="นำรูปนี้ออกจากชุด" disabled={disabled} onClick={()=>setContent({images:images.filter((_,i)=>i!==index)})}><X size={17}/></button></div></article>)}</div>}{images.length<HUB_GALLERY_LIMIT&&<HubMediaUpload pageId={pageId} value="" onChange={url=>{if(url)setContent({images:[...images,{url,alt:"",caption:""}]});}} disabled={disabled} onUploadingChange={onUploadingChange} label={images.length ? "เพิ่มรูปถัดไป" : "เพิ่มรูปแรกในแกลเลอรี"} hint={`เพิ่มได้สูงสุด ${HUB_GALLERY_LIMIT} รูปต่อชุด · ทั้งชุดนับเป็น 1 รายการ`} removable={false}/>}<fieldset className="hce-gallery-layout"><legend>การแสดงแกลเลอรี</legend><div role="group" aria-label="รูปแบบแกลเลอรี"><button type="button" disabled={disabled} aria-pressed={(content.galleryLayout||"grid")==="grid"} onClick={()=>setContent({galleryLayout:"grid"})}><span className="hce-layout-grid" aria-hidden="true"><i/><i/><i/><i/></span>ตารางรูป</button><button type="button" disabled={disabled} aria-pressed={content.galleryLayout==="carousel"} onClick={()=>setContent({galleryLayout:"carousel"})}><span className="hce-layout-carousel" aria-hidden="true"><i/><i/><i/></span>เลื่อนดูทีละรูป</button></div></fieldset></section>}

    {draft.type!=="link"&&draft.type!=="heading"&&<label className="hs-field">{draft.type === "text" ? "ข้อความที่แสดง" : "รายละเอียด / คำบรรยาย"}{draft.type!=="text"&&<span className="hce-optional">ไม่จำเป็น</span>}<textarea required={draft.type==="text"} rows={draft.type==="text"?5:3} maxLength={2000} disabled={disabled} value={draft.description} onChange={event=>onChange({...draft,description:event.target.value})} placeholder={draft.type==="text" ? "เล่าเรื่องของคุณ แนะนำธุรกิจ หรือข้อมูลที่อยากให้คนรู้" : "อธิบายสิ่งที่น่าสนใจในรายการนี้"}/><small>{draft.description.length}/2,000 ตัวอักษร · ขึ้นบรรทัดใหม่ได้</small></label>}
    {draft.type === "promotion"&&<section className="hce-promo-pricing" aria-label="ตั้งราคาส่วนลด">
      <div className="hce-field-heading"><strong><BadgePercent size={18}/>ราคาและส่วนลด</strong><span>คำนวณอัตโนมัติ</span></div>
      <div className="hs-form-columns">
        <label className="hs-field">ราคาปกติ (บาท)<input required inputMode="decimal" maxLength={20} disabled={disabled}
          value={content.originalPrice||""} onChange={event=>setContent({originalPrice:event.target.value})} placeholder="100"/></label>
        <label className="hs-field">ราคาหลังลด (บาท)<input required inputMode="decimal" maxLength={20} disabled={disabled}
          value={content.salePrice||""} onChange={event=>setContent({salePrice:event.target.value})} placeholder="80"/></label>
      </div>
      <div className="hce-promo-price-preview" aria-live="polite">
        {promo?<><span>ลูกค้าจะเห็น</span><del>{formatThaiBaht(promo.originalSatang)}</del>
          <strong>{formatThaiBaht(promo.saleSatang)}</strong><em>ลด {promo.discountPercent}%</em></>
          :<span>กรอกราคาปกติและราคาที่ลดแล้ว เพื่อดูตัวอย่าง</span>}
      </div>
      <small>ตั้งราคาตามข้อมูลจริงของร้านค้า ส่วนลดจะคำนวณจากราคาที่คุณกรอก</small>
    </section>}
    {draft.type === "service"&&<label className="hs-field">ราคา / ข้อความประกอบราคา <span className="hce-optional">ไม่จำเป็น</span><input maxLength={80} disabled={disabled} value={content.price||""} onChange={event=>setContent({price:event.target.value})} placeholder="เช่น เริ่มต้น ฿1,500 หรือ สอบถามราคา"/><small>เป็นข้อมูลแสดงบนการ์ด การชำระเงินทำผ่านช่องทางปลายทางที่คุณเลือก</small></label>}
    {rich&&<section className="hce-action-fields"><div className="hce-field-heading"><strong><ArrowUpRight size={17}/>เพิ่มปุ่มให้คนไปต่อ</strong>{draft.type==="promotion"?<span>ลิงก์ซื้อจำเป็น</span>:<span>ไม่จำเป็น</span>}</div><div className="hs-form-columns"><label className="hs-field">ข้อความบนปุ่ม<input maxLength={40} disabled={disabled} value={content.buttonLabel||""} onChange={event=>setContent({buttonLabel:event.target.value})} placeholder="เช่น สอบถามรายละเอียด"/></label><label className="hs-field">{draft.type==="promotion"?"ลิงก์สินค้า / Affiliate":"ลิงก์ปลายทาง"}<input required={draft.type==="promotion"} inputMode="url" maxLength={2048} disabled={disabled} value={draft.url} onChange={event=>onChange({...draft,url:event.target.value})} placeholder={draft.type==="promotion"?"https://shop.example.com/your-product":"https:// หรือ mailto:"}/></label></div><p>{draft.type==="promotion"?"ใส่ลิงก์ปลายทางของสินค้าจริง ระบบจะนับยอดคลิก ไม่ได้จัดการคำสั่งซื้อหรือชำระเงินแทนร้านค้า":"ใส่ลิงก์เพื่อแสดงปุ่มและเก็บยอดคลิก · เว้นว่างเพื่อแสดง"+option.short+"อย่างเดียว"}</p></section>}
  </div>;
}

export function HubShareSettings({pageId,profile,slug,origin,onChange,disabled,onUploadingChange}:{pageId:string;profile:HubProfile;slug:string;origin:string;onChange:(profile:HubProfile)=>void;disabled:boolean;onUploadingChange:(uploading:boolean)=>void}) {
  const cover=profile.shareImageUrl||profile.avatarUrl;
  let host="hub.naknahr.com";try{host=new URL(origin).host;}catch{}
  return <details className="hs-panel htg-details hce-share-settings"><summary><Share2 size={20}/><span><strong>ตั้งค่าการแชร์ลิงก์</strong><small>กำหนดชื่อ คำอธิบาย และภาพปกบน LINE และโซเชียล</small></span></summary><div className="htg-details-body"><p className="hce-share-intro">กำหนดข้อความและรูปภาพที่จะแสดงเมื่อส่งลิงก์ให้ลูกค้า โดยไม่ต้องมีคำว่า นากนะ HUB ต่อท้าย</p><div className="hce-share-copy-fields"><label className="hs-field">ชื่อเวลาแชร์ลิงก์ <span className="hce-optional">แก้ได้ตามต้องการ</span><input type="text" maxLength={120} disabled={disabled} value={profile.shareTitle||""} onChange={event=>onChange({...profile,shareTitle:event.target.value})} placeholder={profile.name||"ชื่อธุรกิจของคุณ"}/><small>เว้นว่างเพื่อใช้ชื่อฮับโดยตรง ไม่มีการเติมชื่อแพลตฟอร์ม</small></label><label className="hs-field">คำอธิบายเวลาแชร์ <span className="hce-optional">ไม่จำเป็น</span><textarea rows={2} maxLength={280} disabled={disabled} value={profile.shareDescription||""} onChange={event=>onChange({...profile,shareDescription:event.target.value})} placeholder={profile.bio||profile.tagline||"บอกลูกค้าว่าจะพบอะไรเมื่อเปิดลิงก์"}/><small>เว้นว่างเพื่อใช้คำอธิบายโปรไฟล์</small></label></div><div className="hce-share-grid"><div><HubMediaUpload pageId={pageId} value={profile.shareImageUrl||""} onChange={shareImageUrl=>onChange({...profile,shareImageUrl})} disabled={disabled} onUploadingChange={onUploadingChange} label="ภาพปกสำหรับแชร์" hint="แนะนำภาพแนวนอน 1200 × 630 px · ถ้ายังไม่เลือกจะใช้รูปโปรไฟล์"/>{profile.shareImageUrl&&<p className="hce-share-hint">นำภาพปกออกเพื่อกลับไปใช้รูปโปรไฟล์</p>}</div><figure className="hce-share-preview"><div className={`hce-share-art ${profile.shareImageUrl?"":"hce-share-avatar"}`}>{cover?<img src={cover} alt="ตัวอย่างภาพปกเวลาแชร์"/>:<div><Share2 size={30}/><span>เพิ่มรูปโปรไฟล์หรือภาพปก</span></div>}</div><figcaption><span>{host}/h/{slug}</span><strong>{profile.shareTitle?.trim()||profile.name||"ชื่อฮับของคุณ"}</strong><p>{profile.shareDescription?.trim()||profile.bio||profile.tagline||`รวมทุกช่องทางของ ${profile.name||"คุณ"} ไว้ในฮับเดียว`}</p></figcaption><small>ตัวอย่างการแชร์ · รูปแบบจริงขึ้นอยู่กับแต่ละแอป</small></figure></div><p className="hce-share-note"><Check size={15}/>บันทึกฉบับร่าง แล้วเผยแพร่เพื่อใช้ภาพใหม่ · แอปที่เคยแชร์อาจยังแสดงภาพเดิมระหว่างรออัปเดต</p></div></details>;
}
