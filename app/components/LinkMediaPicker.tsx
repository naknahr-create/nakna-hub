'use client';

import {useEffect, useRef, useState} from 'react';
import {Check, Globe2, Image as ImageIcon, LoaderCircle, Shapes, Upload, X} from 'lucide-react';
import {imageAssetId, websiteIconUrl} from '../../lib/hub-link-media';
import {HubIcon} from './ui';
import {HubLinkIcon} from './HubLinkIcon';
import '../link-media.css';

type Mode = 'auto' | 'icon' | 'image';
const ICONS = [
  {id:'link',label:'ลิงก์'},{id:'globe',label:'เว็บไซต์'},{id:'line',label:'LINE'},
  {id:'instagram',label:'Instagram'},{id:'facebook',label:'Facebook'},{id:'youtube',label:'YouTube'},
  {id:'tiktok',label:'TikTok'},{id:'mail',label:'อีเมล'},{id:'map',label:'แผนที่'},
  {id:'shop',label:'ร้านค้า'},{id:'file',label:'เอกสาร'},{id:'briefcase',label:'งาน'},
  {id:'phone',label:'โทรศัพท์'},{id:'calendar',label:'นัดหมาย'},{id:'art',label:'ผลงาน'},
  {id:'book',label:'บทความ'},{id:'coffee',label:'คาเฟ่'},{id:'heart',label:'สิ่งที่ชอบ'},
];
function modeOf(value:string):Mode { return imageAssetId(value) ? 'image' : value === 'auto' ? 'auto' : 'icon'; }

export default function LinkMediaPicker({value,url,onChange,disabled=false,onUploadingChange}:{value:string;url:string;onChange:(value:string)=>void;disabled?:boolean;onUploadingChange?:(uploading:boolean)=>void}) {
  const [mode,setMode] = useState<Mode>(() => modeOf(value));
  const [uploading,setUploading] = useState(false);
  const [error,setError] = useState('');
  const [dragging,setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const uploadCallback = useRef(onUploadingChange); uploadCallback.current = onUploadingChange;
  const lastIcon = useRef(modeOf(value) === 'icon' ? value : 'link');
  useEffect(() => { setMode(modeOf(value)); setError(''); if(modeOf(value) === 'icon') lastIcon.current = value; },[value]);
  useEffect(() => () => { if(controller.current) { const pending = controller.current; controller.current = null; pending.abort(); uploadCallback.current?.(false); } },[]);
  const locked = disabled || uploading;
  const assetId = imageAssetId(value);
  function choose(next:Mode) {
    if(locked) return;
    setMode(next); setError('');
    if(next === 'auto') onChange('auto');
    if(next === 'icon') onChange(lastIcon.current);
  }
  async function upload(file?:File) {
    if(!file || locked) return;
    setError('');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type) || !file.size || file.size > 2*1024*1024) {
      setError('เลือกรูป PNG, JPG หรือ WebP ขนาดไม่เกิน 2 MB');
      if(input.current) input.current.value = '';
      return;
    }
    const pending = new AbortController(); controller.current = pending;
    setUploading(true); uploadCallback.current?.(true);
    try {
      const form = new FormData(); form.append('file',file);
      const response = await fetch('/api/uploads',{method:'POST',body:form,credentials:'same-origin',signal:pending.signal});
      const body = await response.json().catch(() => ({})) as {url?:string;error?:string};
      if(!response.ok) throw new Error(body.error || 'อัปโหลดรูปไม่สำเร็จ กรุณาลองอีกครั้ง');
      const id = typeof body.url === 'string' && body.url.startsWith('/media/') ? imageAssetId('image:' + body.url.slice(7)) : null;
      if(!id) throw new Error('เซิร์ฟเวอร์ส่งรูปกลับมาไม่สมบูรณ์ กรุณาลองใหม่');
      if(!pending.signal.aborted) { onChange('image:' + id); setMode('image'); }
    } catch(cause) {
      if(!pending.signal.aborted) setError(cause instanceof Error ? cause.message : 'เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      if(controller.current === pending) { controller.current = null; setUploading(false); uploadCallback.current?.(false); }
      if(input.current) input.current.value = '';
    }
  }
  return <section className="hlm-picker" aria-label="ไอคอนหรือรูปของลิงก์" aria-busy={uploading}>
    <div className="hlm-picker-heading"><div><strong>ให้ลิงก์มีหน้าตาของตัวเอง</strong><p>ใช้ไอคอนเว็บไซต์ หรือใส่รูปที่คนจำได้</p></div><span className="hlm-current-preview"><HubLinkIcon icon={value} url={url} size={32}/></span></div>
    <div className="hlm-modes" role="group" aria-label="รูปแบบไอคอนลิงก์">
      <button type="button" disabled={locked} aria-pressed={mode === 'auto'} className={mode === 'auto' ? 'selected' : ''} onClick={() => choose('auto')}><Globe2 size={17}/><span>ไอคอนจากเว็บไซต์</span>{mode === 'auto' && <Check size={13}/>}</button>
      <button type="button" disabled={locked} aria-pressed={mode === 'icon'} className={mode === 'icon' ? 'selected' : ''} onClick={() => choose('icon')}><Shapes size={17}/><span>เลือกไอคอน</span>{mode === 'icon' && <Check size={13}/>}</button>
      <button type="button" disabled={locked} aria-pressed={mode === 'image'} className={mode === 'image' ? 'selected' : ''} onClick={() => choose('image')}><ImageIcon size={17}/><span>อัปโหลดรูป</span>{mode === 'image' && <Check size={13}/>}</button>
    </div>
    {mode === 'auto' && <p className="hlm-auto-note">{websiteIconUrl(url) ? 'ดึงไอคอนจาก URL ของเว็บไซต์ให้อัตโนมัติ ถ้าไม่มีรูปจะแสดงไอคอนลิงก์แทน' : 'ใส่ URL เว็บไซต์เพื่อดึงไอคอนอัตโนมัติ หรือเลือกไอคอนและอัปโหลดรูปได้เลย'}</p>}
    {mode === 'icon' && <div className="hlm-icon-grid" role="group" aria-label="เลือกไอคอนสำหรับลิงก์">{ICONS.map(icon => <button key={icon.id} type="button" disabled={locked} aria-pressed={value === icon.id} title={icon.label} className={value === icon.id ? 'selected' : ''} onClick={() => { lastIcon.current = icon.id; onChange(icon.id); }}><HubIcon name={icon.id} size={20}/><span>{icon.label}</span></button>)}</div>}
    {mode === 'image' && <div className="hlm-upload-area">
      <button type="button" disabled={locked} className={`hlm-dropzone ${dragging ? 'hlm-dragging' : ''}`} onClick={() => input.current?.click()} onDragOver={event => {event.preventDefault();if(!locked)setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={event => {event.preventDefault();setDragging(false);if(!locked)void upload(event.dataTransfer.files[0]);}}>
        <span className="hlm-upload-symbol">{uploading ? <LoaderCircle className="hs-spin" size={24}/> : assetId ? <HubLinkIcon icon={value} url={url} size={42}/> : <Upload size={23}/>}</span>
        <span><strong>{uploading ? 'กำลังอัปโหลดรูป…' : assetId ? 'เปลี่ยนรูปของลิงก์' : 'เลือกไฟล์ หรือวางรูปตรงนี้'}</strong><small>PNG, JPG, WebP · ไม่เกิน 2 MB · รูปสี่เหลี่ยมดูชัดที่สุด</small></span>
      </button>
      {assetId && <button type="button" disabled={locked} className="hlm-remove-image" onClick={() => {onChange('auto');setMode('auto');}}><X size={14}/>นำรูปออก แล้วใช้ไอคอนเว็บไซต์</button>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="ไฟล์รูปสำหรับลิงก์" hidden onChange={event => void upload(event.target.files?.[0])}/>
    </div>}
    {error && <p className="hlm-error" role="alert">{error}</p>}
  </section>;
}
