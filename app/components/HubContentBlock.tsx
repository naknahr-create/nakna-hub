'use client';

import {useEffect,useId,useRef,useState,type CSSProperties,type MouseEvent,type TouchEvent} from 'react';
import {ArrowUpRight,ChevronLeft,ChevronRight,Expand,ImageOff,Sparkles,X} from 'lucide-react';
import type {HubBlockImage,HubLink} from '../../lib/hub-types';
import {formatThaiBaht,getPromotionPricing,isProductDiscountEnabled} from '../../lib/hub-promotion';

type ContentBlockProps = {
  block: HubLink;
  /** Public CTAs receive /go/...; studio previews receive the original URL. */
  href?: string;
  onDemoClick?: (title:string)=>void;
};

function ContentImage({url,alt,ratio='landscape',fit='cover',large=false,focusX,focusY,zoom,fullBleed=false}:{url:string;alt:string;ratio?:string;fit?:'cover'|'contain';large?:boolean;focusX?:number;focusY?:number;zoom?:number;fullBleed?:boolean}){
  const framed=focusX!==undefined||focusY!==undefined||zoom!==undefined;
  const x=typeof focusX==='number'&&Number.isFinite(focusX)?Math.max(0,Math.min(100,focusX)):50;
  const y=typeof focusY==='number'&&Number.isFinite(focusY)?Math.max(0,Math.min(100,focusY)):35;
  const zoomRatio=typeof zoom==='number'&&Number.isFinite(zoom)?Math.max(1,Math.min(1.8,zoom/100)):1;
  const imageStyle:CSSProperties={objectFit:fit,...(fullBleed?{objectFit:'cover',width:'100%',height:'100%',position:'absolute' as const,inset:0}:{}),...(framed?{
    objectPosition:`${x}% ${y}%`,
    transform:`scale(${zoomRatio})`,
    transformOrigin:`${x}% ${y}%`
  }: {})};
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[url]);
  return <span className={`hcb-media hcb-ratio-${ratio} ${large?'hcb-media-large':''}`} style={fullBleed?{position:'relative',display:'block',width:'100%',aspectRatio:'1 / 1',overflow:'hidden'}:undefined}>
    {url&&!failed?<img src={url} alt={alt} loading={large?'eager':'lazy'} decoding="async" style={imageStyle} onError={()=>setFailed(true)}/>:<span className="hcb-image-fallback"><ImageOff size={24} aria-hidden="true"/><span>{alt||'รูปภาพยังไม่พร้อมแสดง'}</span></span>}
  </span>;
}

/**
 * The gallery shows one full-width slide at a time. Both Studio and the live
 * page share the same component, and swipe gestures are supported on mobile.
 */
function Gallery({images,title,layout}:{images:HubBlockImage[];title:string;layout:'grid'|'carousel'}){
  const [selected,setSelected]=useState<number|null>(null);
  const [current,setCurrent]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  const swipeStart=useRef<{x:number;y:number}|null>(null);
  const skipOpen=useRef(false);
  const lightboxTitle=useId();
  const galleryId=useId();
  const imageSignature=images.map(image=>image.url).join('|');
  const selectedImage=selected===null?undefined:images[selected];
  const activeIndex=Math.max(0,Math.min(current,images.length-1));
  const entries=layout==='carousel'
    ? images.slice(activeIndex,activeIndex+1).map(image=>({image,index:activeIndex}))
    : images.map((image,index)=>({image,index}));

  useEffect(()=>{
    const modal=dialog.current;
    if(!modal)return;
    if(selectedImage&&!modal.open)modal.showModal();
    if(!selectedImage&&modal.open)modal.close();
  },[selectedImage]);
  useEffect(()=>{
    setCurrent(0);
    setSelected(null);
  },[layout,imageSignature]);

  function stepLightbox(direction:number){
    setSelected(index=>index===null?null:(index+direction+images.length)%images.length);
  }
  function moveSlide(direction:number){
    setCurrent(index=>Math.max(0,Math.min(images.length-1,index+direction)));
  }
  function onSwipeStart(event:TouchEvent<HTMLDivElement>){
    const touch=event.touches[0];
    swipeStart.current=event.touches.length===1&&touch?{x:touch.clientX,y:touch.clientY}:null;
  }
  function onSwipeEnd(event:TouchEvent<HTMLDivElement>){
    const start=swipeStart.current;
    swipeStart.current=null;
    const touch=event.changedTouches[0];
    if(!start||!touch)return;
    const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
    if(Math.abs(dx)<42||Math.abs(dx)<Math.abs(dy)*1.2)return;
    skipOpen.current=true;
    moveSlide(dx<0?1:-1);
    window.setTimeout(()=>{skipOpen.current=false;},300);
  }

  return <>
    {layout==='carousel'&&images.length>1&&
      <div className="hcb-gallery-toolbar">
        <span aria-live="polite">{activeIndex+1} / {images.length} รูป</span>
        <div>
          <button type="button" aria-label={'ดูรูปก่อนหน้าใน '+title} aria-controls={galleryId} disabled={activeIndex===0} onClick={()=>moveSlide(-1)}><ChevronLeft size={18}/></button>
          <button type="button" aria-label={'ดูรูปถัดไปใน '+title} aria-controls={galleryId} disabled={activeIndex===images.length-1} onClick={()=>moveSlide(1)}><ChevronRight size={18}/></button>
        </div>
      </div>}
    <div id={galleryId}
      className={layout==='carousel'?'hcb-gallery-stage':'hcb-gallery hcb-gallery-grid'}
      data-count={images.length}
      aria-label={layout==='carousel'?'ผลงาน '+(activeIndex+1)+' จาก '+images.length:undefined}
      onTouchStart={layout==='carousel'?onSwipeStart:undefined}
      onTouchEnd={layout==='carousel'?onSwipeEnd:undefined}
      onTouchCancel={layout==='carousel'?()=>{swipeStart.current=null;}:undefined}
      style={layout==='carousel'
        ? {display:'block',width:'100%',minWidth:0,maxWidth:'100%',overflow:'hidden',touchAction:'pan-y'}
        : {display:'grid',width:'100%',minWidth:0,maxWidth:'100%',gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}>
      {entries.map(({image,index})=><figure className="hcb-gallery-item" key={image.url+'-'+index}
        style={{display:'block',width:'100%',minWidth:0,maxWidth:'100%',margin:0}}>
        <button className="hcb-gallery-open" type="button"
          style={{display:'block',width:'100%',minWidth:0}}
          aria-label={'ขยายรูป '+(index+1)+' จาก '+images.length+': '+(image.alt||image.caption||title)}
          aria-haspopup="dialog"
          onClick={()=>{if(skipOpen.current){skipOpen.current=false;return;}setSelected(index);}}>
          <ContentImage url={image.url} alt={image.alt||image.caption||(title+' รูปที่ '+(index+1))} ratio="square" fullBleed/>
          <span className="hcb-expand" aria-hidden="true"><Expand size={16}/></span>
        </button>
        {image.caption&&<figcaption>{image.caption}</figcaption>}
      </figure>)}
    </div>
    <dialog className="hcb-lightbox" ref={dialog} aria-labelledby={lightboxTitle}
      onClose={()=>setSelected(null)} onCancel={()=>setSelected(null)}
      onClick={event=>{if(event.target===event.currentTarget)setSelected(null);}}
      onKeyDown={event=>{if(event.key==='ArrowLeft'){event.preventDefault();stepLightbox(-1);}if(event.key==='ArrowRight'){event.preventDefault();stepLightbox(1);}}}>
      <div className="hcb-lightbox-panel">
        <div className="hcb-lightbox-header"><h2 id={lightboxTitle}>{title}</h2><button type="button" autoFocus onClick={()=>setSelected(null)} aria-label="ปิดรูปภาพ"><X size={23}/></button></div>
        {selectedImage&&<figure className="hcb-lightbox-figure"><ContentImage url={selectedImage.url} alt={selectedImage.alt||selectedImage.caption||title} fit="contain" ratio="auto" large/><figcaption>{selectedImage.caption||selectedImage.alt||title}</figcaption></figure>}
        <div className="hcb-lightbox-footer"><button type="button" aria-label="รูปก่อนหน้า" disabled={images.length<2} onClick={()=>stepLightbox(-1)}><ChevronLeft size={20}/><span>ก่อนหน้า</span></button><span aria-live="polite">{selected===null?1:selected+1} / {images.length}</span><button type="button" aria-label="รูปถัดไป" disabled={images.length<2} onClick={()=>stepLightbox(1)}><span>ถัดไป</span><ChevronRight size={20}/></button></div>
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
  const saleText=promo?formatThaiBaht(promo.saleSatang):"";
  const saleSize=saleText.length>=13?"extra-long":saleText.length>=10?"long":saleText.length>=8?"compact":"regular";
  const regularPrice=block.type==='service'&&!discountEnabled?content.price?.trim()||"":"";
  const regularPriceIsAmount=/^(?:฿\s*)?\d[\d,]*(?:\.\d{1,2})?(?:\s*บาท)?$/u.test(regularPrice);
  const regularPriceSize=!regularPriceIsAmount?"regular":regularPrice.length>=13?"extra-long":regularPrice.length>=10?"long":regularPrice.length>=8?"compact":"regular";
  const images=Array.isArray(content.images)?content.images.slice(0,6):[];
  const isProduct=block.type==='service'||block.type==='promotion';
  function navigate(event:MouseEvent<HTMLAnchorElement>){if(onDemoClick){event.preventDefault();onDemoClick(block.title);}}
  const action=hasAction?<a className="hcb-action" href={href} target="_blank" rel="noopener" aria-label={`${actionLabel}: ${block.title} เปิดในแท็บใหม่`} onClick={navigate}><span>{actionLabel}</span><ArrowUpRight size={18} aria-hidden="true"/></a>:null;
  const photo=content.imageUrl?<ContentImage url={content.imageUrl} alt={isProduct?block.title:content.alt||block.title}
    ratio={content.aspectRatio||'landscape'} fit={content.fit||'cover'}
    focusX={isProduct?content.imageFocusX??50:undefined}
    focusY={isProduct?content.imageFocusY??35:undefined}
    zoom={isProduct?content.imageZoom??100:undefined}/>:null;
  if(!['text','image','gallery','service','promotion'].includes(block.type))return null;

  // IMPORTANT: The outer card must NOT have `hcb-gallery`.
  // `.hcb-gallery` is the two-column inner gallery GRID selector in hub-content.css.
  // Reusing it on the article split the entire card into 2 columns and kept
  // the carousel artwork stuck in the left half (the reported Studio bug).
  return <article className={`hcb ${block.type==='gallery'?'hcb-gallery-block':`hcb-${block.type}`} ${discountEnabled&&block.type==='service'?'hcb-promotion':''} ${block.featured?'hcb-featured':''} ${!photo?'hcb-no-photo':''}`} aria-labelledby={titleId} data-block-type={block.type}>
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
                <strong className={`hcb-sale-price hcb-sale-price-${saleSize}`}>{saleText}</strong>
              </div>
              <span className="hcb-promo-discount">ลด {promo.discountPercent}%</span>
            </div>}
            {regularPrice&&<p className={`hcb-price hcb-regular-price-${regularPriceSize}`}>{regularPrice}</p>}
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
