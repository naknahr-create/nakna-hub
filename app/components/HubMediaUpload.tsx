'use client';

import {useEffect, useId, useRef, useState, type DragEvent} from 'react';
import {Check, Image as ImageIcon, LoaderCircle, RefreshCw, Upload, X} from 'lucide-react';
import '../media-upload.css';

type Props = {
  pageId: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  label?: string;
  hint?: string;
  removable?: boolean;
};

const MAX_SOURCE_SIZE = 15 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 2 * 1024 * 1024;
const MAX_SIDE = 1600;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const UPLOADED_IMAGE = /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');
}

function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('ยังเตรียมรูปนี้ไม่ได้ ลองเลือกรูปอื่นอีกครั้ง'));
  }, type, quality));
}

/** Decode local files only. A smaller original is kept when resizing is unnecessary. */
async function prepareImage(file: File, signal: AbortSignal): Promise<File> {
  if (!IMAGE_TYPES.has(file.type)) throw new Error('เลือกรูป PNG, JPG หรือ WebP เท่านั้น');
  if (file.size === 0) throw new Error('ไฟล์รูปนี้ไม่มีข้อมูล ลองเลือกไฟล์อื่น');
  if (file.size > MAX_SOURCE_SIZE) throw new Error('เลือกรูปต้นฉบับขนาดไม่เกิน 15 MB');
  checkCancelled(signal);
  const objectUrl = URL.createObjectURL(file);
  try {
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const clear = () => {
        image.onload = null; image.onerror = null;
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {clear(); image.src = ''; reject(new DOMException('Upload cancelled', 'AbortError'));};
      image.onload = () => {clear(); resolve(image);};
      image.onerror = () => {clear(); reject(new Error('อ่านรูปนี้ไม่ได้ ไฟล์อาจเสียหาย ลองเลือกรูปใหม่'));};
      signal.addEventListener('abort', abort, {once: true});
      image.src = objectUrl;
    });
    checkCancelled(signal);
    const width = source.naturalWidth, height = source.naturalHeight;
    if (!width || !height || width * height > 100_000_000) throw new Error('รูปมีขนาดใหญ่เกินไป กรุณาลดขนาดรูปแล้วลองอีกครั้ง');
    if (file.size <= MAX_UPLOAD_SIZE && Math.max(width, height) <= MAX_SIDE) return file;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('เบราว์เซอร์ยังปรับขนาดรูปไม่ได้ ลองใช้รูปขนาดไม่เกิน 2 MB');
    const fallbackType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    let longSide = Math.min(MAX_SIDE, Math.max(width, height));
    // WebP keeps transparent backgrounds. If unsupported, PNG keeps them too.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      checkCancelled(signal);
      const scale = longSide / Math.max(width, height);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      let result = await encodeCanvas(canvas, 'image/webp', attempt === 0 ? .9 : .82);
      checkCancelled(signal);
      if (result.type !== 'image/webp') result = await encodeCanvas(canvas, fallbackType, .88);
      checkCancelled(signal);
      if (result.size <= MAX_UPLOAD_SIZE && IMAGE_TYPES.has(result.type)) {
        const extension = result.type === 'image/jpeg' ? 'jpg' : result.type === 'image/png' ? 'png' : 'webp';
        return new File([result], `${file.name.replace(/\.[^.]+$/, '') || 'hub-image'}.${extension}`, {type: result.type});
      }
      longSide = Math.round(longSide * .75);
    }
    throw new Error('รูปยังมีขนาดใหญ่เกิน 2 MB หลังปรับขนาด ลองลดขนาดรูปหรือเลือกรูปอื่น');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function HubMediaUpload({pageId, value, onChange, disabled = false, onUploadingChange, label = 'รูปภาพ', hint, removable = true}: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const uploadCallback = useRef(onUploadingChange); uploadCallback.current = onUploadingChange;
  const changeCallback = useRef(onChange); changeCallback.current = onChange;
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'uploading'>('idle');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const uploading = phase !== 'idle';
  const locked = disabled || uploading;
  const status = phase === 'preparing' ? 'กำลังเตรียมรูปให้พอดี…' : phase === 'uploading' ? 'กำลังอัปโหลดรูป…' : notice;

  useEffect(() => {setImageFailed(false);}, [value]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const pending = controller.current;
      controller.current = null;
      if (pending) {pending.abort(); uploadCallback.current?.(false);}
    };
  }, []);

  async function upload(file?: File) {
    if (!file || disabled || controller.current) return;
    setError(''); setNotice(''); setDragging(false);
    const pending = new AbortController();
    controller.current = pending;
    setPhase('preparing'); uploadCallback.current?.(true);
    try {
      const ready = await prepareImage(file, pending.signal);
      checkCancelled(pending.signal);
      if (!mounted.current || controller.current !== pending) return;
      setPhase('uploading');
      const form = new FormData();
      form.append('file', ready); form.append('pageId', pageId);
      const response = await fetch('/api/uploads', {method: 'POST', body: form, credentials: 'same-origin', signal: pending.signal});
      const payload = await response.json().catch(() => null) as {url?: unknown; error?: unknown} | null;
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : response.status === 401 ? 'กรุณาเข้าสู่ระบบใหม่ก่อนอัปโหลดรูป' : 'ยังอัปโหลดรูปไม่ได้ กรุณาลองอีกครั้ง');
      if (typeof payload?.url !== 'string' || !UPLOADED_IMAGE.test(payload.url)) throw new Error('เซิร์ฟเวอร์ตอบกลับไม่สมบูรณ์ กรุณาลองใหม่');
      checkCancelled(pending.signal);
      if (mounted.current && controller.current === pending) {
        setNotice('อัปโหลดรูปแล้ว');
        changeCallback.current(payload.url);
      }
    } catch (issue) {
      if (!pending.signal.aborted && mounted.current && controller.current === pending) {
        setError(issue instanceof TypeError ? 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง' : issue instanceof Error ? issue.message : 'ยังอัปโหลดรูปไม่ได้ กรุณาลองอีกครั้ง');
      }
    } finally {
      if (controller.current === pending) {
        controller.current = null;
        if (mounted.current) {setPhase('idle'); if (input.current) input.current.value = '';}
        uploadCallback.current?.(false);
      }
    }
  }

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault(); setDragging(false);
    if (locked) return;
    if (event.dataTransfer.files.length !== 1) {setError('เลือกรูปครั้งละ 1 ไฟล์'); return;}
    void upload(event.dataTransfer.files[0]);
  }

  return <section className="hmu-control" aria-labelledby={`${id}-label`} aria-busy={uploading}>
    <div className="hmu-heading"><span id={`${id}-label`} className="hmu-label">{label}</span>{value && removable && <button type="button" className="hmu-remove" disabled={locked} onClick={() => {setError(''); setNotice('นำรูปออกแล้ว'); onChange('');}} aria-label={`นำ${label}ออก`} data-tooltip={`นำ${label}ออกจากรายการนี้`}><X size={15} aria-hidden="true"/>นำรูปออก</button>}</div>
    <button type="button" className={`hmu-dropzone ${value ? 'hmu-has-image' : ''} ${dragging ? 'hmu-dragging' : ''}`} disabled={locked} aria-describedby={`${id}-hint`} aria-label={`${value ? 'เปลี่ยน' : 'เลือก'}${label}`} onClick={() => input.current?.click()} onDragOver={event => {event.preventDefault(); if (!locked && event.dataTransfer.types.includes('Files')) setDragging(true);}} onDragLeave={event => {if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);}} onDrop={drop}>
      {value ? <span className="hmu-thumbnail">{imageFailed ? <ImageIcon size={28} aria-hidden="true"/> : <img src={value} alt={`ตัวอย่าง${label}`} onError={() => setImageFailed(true)}/>}</span> : <span className="hmu-upload-icon"><ImageIcon size={25} aria-hidden="true"/></span>}
      <span className="hmu-copy"><strong>{phase === 'preparing' ? 'กำลังเตรียมรูป' : phase === 'uploading' ? 'กำลังอัปโหลด' : value ? 'เปลี่ยนรูปภาพ' : 'เลือกไฟล์รูปภาพ'}</strong><span>{imageFailed ? 'เปิดตัวอย่างรูปไม่ได้ ลองเลือกรูปใหม่' : value ? 'คลิกเพื่อเปลี่ยน หรือลากรูปใหม่มาวาง' : 'คลิกเพื่อเลือกไฟล์ หรือลากรูปมาวางที่นี่'}</span></span>
      <span className="hmu-action-icon" aria-hidden="true">{uploading ? <LoaderCircle size={21} className="hmu-spin"/> : value ? <RefreshCw size={20}/> : <Upload size={21}/>}</span>
    </button>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={`ไฟล์${label}`} onChange={event => void upload(event.target.files?.[0])} disabled={locked}/>
    <p id={`${id}-hint`} className="hmu-hint">{hint && <span>{hint}</span>}<span>PNG, JPG หรือ WebP สูงสุด 15 MB · ปรับขนาดให้อัตโนมัติก่อนอัปโหลด</span></p>
    {status && <p className={`hmu-status ${uploading ? 'hmu-progress' : ''}`} role="status">{uploading ? <LoaderCircle size={14} className="hmu-spin" aria-hidden="true"/> : <Check size={14} aria-hidden="true"/>}{status}</p>}
    {error && <p className="hmu-error" role="alert">{error}</p>}
  </section>;
}
