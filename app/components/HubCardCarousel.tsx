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
  track.scrollTo({left:tile.offsetLeft-track.children[0].getBoundingClientRect().left+track.getBoundingClientRect().left,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
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
 return <div className="hc-card-carousel" aria-label="การ์ดสินค้าและบริการ">
  <div className="hc-card-rail" id={railId} ref={rail} onScroll={update} tabIndex={blocks.length>1?0:undefined} aria-label="ปัดซ้ายหรือขวาเพื่อดูการ์ดเพิ่มเติม">
   {blocks.map(block=><div className="hc-card-slide" key={block.id}><HubContentBlock block={block} href={href(block)} onDemoClick={onDemoClick}/></div>)}
  </div>
  {blocks.length>1&&<div className="hc-card-navigation"><span className="hc-card-counter" aria-live="polite">{current+1} / {blocks.length}</span><div className="hc-card-dots" aria-label="เลือกการ์ด">{blocks.map((block,index)=><button key={block.id} type="button" aria-label={`ไปการ์ดที่ ${index+1}`} aria-current={index===current?'true':undefined} onClick={()=>move(index)}/>)}</div><div className="hc-card-arrows"><button type="button" aria-label="การ์ดก่อนหน้า" aria-controls={railId} disabled={current===0} onClick={()=>move(current-1)}><ChevronLeft size={19}/></button><button type="button" aria-label="การ์ดถัดไป" aria-controls={railId} disabled={current===blocks.length-1} onClick={()=>move(current+1)}><ChevronRight size={19}/></button></div></div>}
 </div>;
}
