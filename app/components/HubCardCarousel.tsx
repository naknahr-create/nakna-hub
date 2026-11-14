'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import type {HubLink} from '../../lib/hub-types';
import {HubContentBlock} from './HubContentBlock';

export function HubCardCarousel({blocks,href,onDemoClick}:{blocks:HubLink[];href:(block:HubLink)=>string|undefined;onDemoClick?:(title:string)=>void}){
 const rail=useRef<HTMLDivElement>(null);
 const [current,setCurrent]=useState(0);
 const railId=useId();
 useEffect(()=>setCurrent(0),[blocks.map(block=>block.id).join(',')]);
 function move(index:number){
  const track=rail.current;
  if(!track)return;
  const next=Math.max(0,Math.min(blocks.length-1,index));
  const tile=track.children[next] as HTMLElement|undefined;
  if(!tile)return;
  track.scrollTo({left:tile.offsetLeft-(track.children[0] as HTMLElement).offsetLeft,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  setCurrent(next);
 }
 function update(){
  const track=rail.current;
  if(!track)return;
  let closest=0, distance=Infinity;
  Array.from(track.children).forEach((child,index)=>{
   const left=(child as HTMLElement).offsetLeft-(track.children[0] as HTMLElement).offsetLeft;
   const delta=Math.abs(left-track.scrollLeft);
   if(delta<distance){distance=delta;closest=index;}
  });
  setCurrent(closest);
 }
 const label=blocks[0]?.type==="promotion"?"โปรโมชั่น":"สินค้าและบริการ";
 return <div className="hc-card-carousel" aria-label={label}>
  <div className="hc-card-rail" id={railId} ref={rail} onScroll={update}
       onKeyDown={event=>{if(event.key==='ArrowRight'){event.preventDefault();move(current+1);}else if(event.key==='ArrowLeft'){event.preventDefault();move(current-1);}}}
       tabIndex={blocks.length>1?0:undefined} aria-roledescription="carousel" aria-label={`ปัดซ้ายหรือขวาเพื่อดู${label}ถัดไป`}>
   {blocks.map((block,index)=><div className="hc-card-slide" role="group" aria-roledescription="slide" aria-label={`${label} ${index+1} จาก ${blocks.length}: ${block.title}`} key={block.id}><HubContentBlock block={block} href={href(block)} onDemoClick={onDemoClick}/></div>)}
  </div>
  {blocks.length>1&&<>
    <span className="hc-card-floating-count" aria-live="polite">{current+1} / {blocks.length}</span>
    <button className="hc-card-float-arrow hc-card-float-prev" type="button" aria-label="สินค้าก่อนหน้า" aria-controls={railId} disabled={current===0} onClick={()=>move(current-1)}><ChevronLeft size={19}/></button>
    <button className="hc-card-float-arrow hc-card-float-next" type="button" aria-label="สินค้าถัดไป" aria-controls={railId} disabled={current===blocks.length-1} onClick={()=>move(current+1)}><ChevronRight size={19}/></button>
  </>}
 </div>;
}
