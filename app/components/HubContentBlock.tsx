'use client';

import {useEffect,useId,useRef,useState,type CSSProperties,type MouseEvent} from 'react';
import {ArrowUpRight,ChevronLeft,ChevronRight,Expand,ImageOff,Sparkles,X} from 'lucide-react';
import type {HubBlockImage,HubLink} from '../../lib/hub-types';
import {formatThaiBaht,getPromotionPricing,isProductDiscountEnabled} from '../../lib/hub-promotion';

type ContentBlockProps = {
  block: HubLink;
  /** Public CTAs receive /go/...; studio previews receive the original URL. */
  href?: string;
  onDemoClick?: (title:string)=>void;
};

function ContentImage({url,alt,ratio='landscape',fit='cover',large=false,focusX,focusY,zoom}:{url:string;alt:string;ratio?:string;fit?:'cover'|'contain';large?:boolean;focusX?:number;focusY?:number;zoom?:number}){
  const framed=focusX!==undefined||focusY!==undefined||zoom!==undefined;
  const x=typeof focusX==='number'&&Number.isFinite(focusX)?Math.max(0,Math.min(100,focusX)):50;
  const y=typeof focusY==='number'&&Number.isFinite(focusY)?Math.max(0,Math.min(100,focusY)):35;
  const zoomRatio=typeof zoom==='number'&&Number.isFinite(zoom)?Math.max(1,Math.min(1.8,zoom/100)):1;
  const imageStyle:CSSProperties={objectFit:fit,...(framed?{
    objectPosition:`${x}% ${y}%`,
    transform:`scale(${zoomRatio})`,
    transformOrigin:`${x}% ${y}%`
  }: {})};
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[url]);
  return <span className={`hcb-media hcb-ratio-${ratio} ${large?'hcb-media-large':''}`}>
    {url&&!failed?<img src={url} alt={alt} loading={large?'eager':'lazy'} decoding="async" style={imageStyle} onError={()=>setFailed(true)}/>:<span className="hcb-image-fallback"><ImageOff size={24} aria-hidden="true"/><span>{alt||'รูปภาพยังไม่พร้อมแสดง'}</span></span>}
  </span>;
}

function Gallery({images,title,layout}:{images:HubBlockImage[];title:string;layout:'grid'|'carousel'}){
  const [selected,setSelected]=useState<number|null>(null);
  const [current,setCurrent]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  const rail=useRef<HTMLDivElement>(null);
  const lightboxTitle=useId();
  const railId=useId();
  const selectedImage=selected===null?undefined:images[selected];

  useEffect(()=>{
    const modal=dialog.current;
    if(!modal)return;
    if(selectedImage&&!modal.open)modal.showModal();
    if(!selectedImage&&modal.open)modal.close();
  },[selectedImage]);

  useEffect(()=>{
    setCurrent(0);
    rail.current?.scrollTo({left:0});
  },[layout,images.length]);

  function step(direction:number){
    if(selected===null)return;
    setSelected((selected+direction+images.length)%images.length);
  }

  function moveRail(direction:number){
    const track=rail.current;
    if(!track)return;
    const target=Math.max(0,Math.min(images.length-1,current+direction));
    const tile=track.children[target] as HTMLElement|undefined;
    if(tile)track.scrollTo({left:tile.offsetLeft,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }

  function updatePosition(){
    const track=rail.current;
    if(!track)return;
    let index=0,distance=Infinity;
    for(let i=0;i<track.children.length;i++){
      const tile=track.children[i] as HTMLElement;
      const next=Math.abs(tile.offsetLeft-track.scrollLeft);
      if(next<distance){distance=next;index=i;}
    }
    setCurrent(index);
  }

  return <>
    {layout==='carousel'&&images.length>1&&<div className="hcb-gallery-toolbar"><span aria-live="polite">{current+1} / {images.length} รูป</span><div><button type="button" aria-label={`ดูรูปก่อนหน้าใน ${title}`} aria-controls={railId} disabled={current===0} onClick={()=>moveRail(-1)}><ChevronLeft size={18}/></button><button type="button" aria-label={`ดูรูปถัดไปใน ${title}`} aria-controls={railId} disabled={current===images.length-1} onClick={()=>moveRail(1)}><ChevronRight size={18}/></button></div></div>}
    <div ref={rail} id={railId} className={`hcb-gallery hcb-gallery-${layout}`} data-count={images.length} onScroll={layout==='carousel'?updatePosition:undefined}>
      {images.map((image,index)=><figure className="hcb-gallery-item" key={`${image.url}-${index}`}>
        <button className="hcb-gallery-open" type="button" aria-label={`ขยายรูป ${index+1} จาก ${images.length}: ${image.alt||image.caption||title}`} aria-haspopup="dialog" onClick={()=>setSelected(index)}>
          <ContentImage url={image.url} alt={image.alt||image.caption||`${title} รูปที่ ${index+1}`} ratio="square"/>
          <span className="hcb-expand" aria-hidden="true"><Expand size={16}/></span>
        </button>
        {image.caption&&<figcaption>{image.caption}</figcaption>}
      </figure>)}
    </div>
    <dialog className="hcb-lightbox" ref={dialog} aria-labelledby={lightboxTitle}
      onClose={()=>setSelected(null)} onCancel={()=>setSelected(null)}
      onClick={event=>{if(event.target===event.currentTarget)setSelected(null);}}
      onKeyDown={event=>{if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}if(event.key==='ArrowRight'){event.preventDefault();step(1);}}}>
      <div className="hcb-lightbox-panel">
        <div className="hcb-lightbox-header"><h2 id={lightboxTitle}>{title}</h2><button type="button" autoFocus onClick={()=>setSelected(null)} aria-label="ปิดรูปภาพ"><X size={23}/></button></div>
        {selectedImage&&<figure className="hcb-lightbox-figure"><ContentImage url={selectedImage.url} alt={selectedImage.alt||selectedImage.caption||title} fit="contain" ratio="auto" large/><figcaption>{selectedImage.caption||selectedImage.alt||title}</figcaption></figure>}
        <div className="hcb-lightbox-footer"><button type="button" aria-label="รูปก่อนหน้า" disabled={images.length<2} onClick={()=>step(-1)}><ChevronLeft size={20}/><span>ก่อนหน้า</span></button><span aria-live="polite">{selected===null?1:selected+1} / {images.length}</span><button type="button" aria-label="รูปถัดไป" disabled={images.length<2} onClick={()=>step(1)}><span>ถัดไป</span><ChevronRight size={20}/></button></div>
      </div>
    </dialog>
  </>;
}

export function HubContentBlock({block,href,onDemoClick}:ContentBlockProps){
  const content=block.content||{};
  const titleId=useId();
  const hasAction=!!(block.url&&href);
  const discountEnabled=isProductDiscountEnabled(block.type,content);
  const actionLabel=content.buttonLabel||(discountEnabled?'ดูสินค้า / ซื้อเลย':block.type==='service'?'สอบถามรายละเอียด':'ดูเพิ่มเติม');
  const promo=discountEnabled?getPromotionPricing(content.originalPrice,content.salePrice):null;
  const images=Array.isArray(content.images)?content.images.slice(0,6):[];
  const isProduct=block.type==='service'||block.type==='promotion';
  function navigate(event:MouseEvent<HTMLAnchorElement>){if(onDemoClick){event.preventDefault();onDemoClick(block.title);}}
  const action=hasAction?<a className="hcb-action" href={href} target="_blank" rel="noopener" aria-label={`${actionLabel}: ${block.title} เปิดในแท็บใหม่`} onClick={navigate}><span>{actionLabel}</span><ArrowUpRight size={18} aria-hidden="true"/></a>:null;
  const photo=content.imageUrl?<ContentImage url={content.imageUrl} alt={content.alt||block.title}
    ratio={content.aspectRatio||'landscape'} fit={content.fit||'cover'}
    focusX={isProduct?content.imageFocusX??50:undefined}
    focusY={isProduct?content.imageFocusY??35:undefined}
    zoom={isProduct?content.imageZoom??100:undefined}/>:null;
  if(!['text','image','gallery','service','promotion'].includes(block.type))return null;

  return <article className={`hcb hcb-${block.type} ${discountEnabled&&block.type==='service'?'hcb-promotion':''} ${block.featured?'hcb-featured':''} ${!photo?'hcb-no-photo':''}`} aria-labelledby={titleId} data-block-type={block.type}>
    {block.featured&&!discountEnabled&&<span className="hcb-featured-label"><Sparkles size={12} aria-hidden="true"/>แนะนำ</span>}
    {isProduct?<>
      <div className="hcb-product-stage">
        {photo?<div className="hcb-cover hcb-product-photo">
          {hasAction?<a href={href} target="_blank" rel="noopener" aria-label={`${actionLabel}: ${block.title} เปิดในแท็บใหม่`} onClick={navigate}>{photo}</a>:photo}
        </div>:<div className="hcb-product-placeholder" aria-hidden="true"><ImageOff size={26}/></div>}
        <div className="hcb-product-overlay hcb-product-body">
          <h2 id={titleId} className="hcb-title">{block.title}</h2>
          <div className="hcb-product-description-slot">
            {block.description&&<div className="hcb-description">{block.description.replace(/\s+/g," ").trim()}</div>}
          </div>
          <div className="hcb-product-price-slot">
            {promo&&<div className="hcb-promo-prices" aria-label={`ราคาปกติ ${formatThaiBaht(promo.originalSatang)} ราคาหลังลด ${formatThaiBaht(promo.saleSatang)} ลด ${promo.discountPercent} เปอร์เซ็นต์`}>
              <div className="hcb-promo-amount">
                <del>{formatThaiBaht(promo.originalSatang)}</del>
                <strong>{formatThaiBaht(promo.saleSatang)}</strong>
              </div>
              <span className="hcb-promo-discount">ลด {promo.discountPercent}%</span>
            </div>}
            {block.type==='service'&&!discountEnabled&&content.price&&<p className="hcb-price">{content.price}</p>}
          </div>
        </div>
      </div>
      <div className="hcb-product-footer">
        <div className="hcb-product-action-slot">{action}</div>
      </div>
    </>:<>
      {photo&&<div className="hcb-cover">
        {hasAction?<a href={href} target="_blank" rel="noopener" aria-label={`${actionLabel}: ${block.title} เปิดในแท็บใหม่`} onClick={navigate}>{photo}</a>:photo}
      </div>}
      <div className="hcb-body">
        <h2 id={titleId} className="hcb-title">{block.title}</h2>
        {block.description&&<div className="hcb-description">{block.description.split(/\n\s*\n/).filter(Boolean).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>}
        {block.type==='gallery'&&(images.length?<Gallery images={images} title={block.title} layout={content.galleryLayout||'grid'}/>:<div className="hcb-gallery-empty"><ImageOff size={22} aria-hidden="true"/><span>รูปภาพกำลังจะมา</span></div>)}
        {action&&<div className="hcb-bottom">{action}</div>}
      </div>
    </>}
  </article>;
}
