'use client';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import type {HubLink} from '../../lib/hub-types';
import {HubContentBlock} from './HubContentBlock';

type Props={
 blocks:HubLink[];
 href:(block:HubLink)=>string|undefined;
 onDemoClick?:(title:string)=>void;
 /** Shared product rail adapts to one hero card or multiple swipeable products. */
 compact?:boolean;
};
export function HubCardCarousel({blocks,href,onDemoClick,compact=false}:Props){
 const rail=useRef<HTMLDivElement>(null);
 const [current,setCurrent]=useState(0);
 const [edges,setEdges]=useState({prev:false,next:false});
 const railId=useId();
 const compactCards=compact&&blocks.every(block=>block.type==='service'||block.type==='promotion');
 const singleCard=compactCards&&blocks.length===1;
 const label='สินค้าและบริการ';
 const signature=blocks.map(block=>block.id).join(',');

 const readPosition=useCallback(()=>{
  const track=rail.current;
  if(!track)return;
  const children=Array.from(track.children) as HTMLElement[];
  const first=children[0];
  if(first){
   let closest=0,distance=Infinity;
   for(let i=0;i<children.length;i++){
    const left=children[i].offsetLeft-first.offsetLeft;
    const delta=Math.abs(left-track.scrollLeft);
    if(delta<distance){distance=delta;closest=i;}
   }
   const max=Math.max(0,track.scrollWidth-track.clientWidth);
   // At the far right, the last promotion is the current destination even if
   // several narrow tiles remain partially visible beside it.
   setCurrent(compactCards&&max>1&&track.scrollLeft>=max-2?children.length-1:closest);
  }
  if(compactCards){
   const max=Math.max(0,track.scrollWidth-track.clientWidth);
   const prev=track.scrollLeft>2;
   const next=track.scrollLeft<max-2;
   setEdges(old=>old.prev===prev&&old.next===next?old:{prev,next});
  }
 },[compactCards]);

 useEffect(()=>{
  const track=rail.current;
  setCurrent(0);
  if(!track||!compactCards)return;
  // ResizeObserver makes arrows reflect both real phones and the resizable Studio preview.
  const refresh=()=>readPosition();
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(refresh);
  observer?.observe(track);
  Array.from(track.children).forEach(child=>observer?.observe(child));
  window.addEventListener('resize',refresh);
  refresh();
  return ()=>{observer?.disconnect();window.removeEventListener('resize',refresh);};
 },[signature,compactCards,readPosition]);

 function move(index:number){
  const track=rail.current;
  if(!track)return;
  const next=Math.max(0,Math.min(blocks.length-1,index));
  const tile=track.children[next] as HTMLElement|undefined;
  if(!tile)return;
  const first=track.children[0] as HTMLElement;
  const destination=tile.offsetLeft-first.offsetLeft;
  const max=Math.max(0,track.scrollWidth-track.clientWidth);
  track.scrollTo({left:Math.min(max,destination),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  setCurrent(next);
 }

 function stepCompact(direction:-1|1){
  const track=rail.current;
  if(!track)return;
  const children=Array.from(track.children) as HTMLElement[];
  const first=children[0];
  if(!first)return;
  const positions=children.map(child=>child.offsetLeft-first.offsetLeft);
  const now=track.scrollLeft;
  const max=Math.max(0,track.scrollWidth-track.clientWidth);
  const destination=direction===1
   ?positions.find(left=>left>now+3)??max
   :[...positions].reverse().find(left=>left<now-3)??0;
  track.scrollTo({left:Math.max(0,Math.min(max,destination)),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }

 function moveWithKeys(direction:-1|1){
  if(compactCards)stepCompact(direction);
  else move(current+direction);
 }

 return <div className={`hc-card-carousel ${compactCards?'hc-card-carousel-compact':''} ${singleCard?'hc-card-carousel-single':''}`} aria-label={label} data-count={blocks.length}>
  <div className="hc-card-rail" id={railId} ref={rail} onScroll={readPosition}
       onKeyDown={event=>{if(event.key==='ArrowRight'){event.preventDefault();moveWithKeys(1);}else if(event.key==='ArrowLeft'){event.preventDefault();moveWithKeys(-1);}}}
       tabIndex={blocks.length>1?0:undefined} aria-roledescription="carousel" aria-label={blocks.length>1?`ปัดซ้ายหรือขวาเพื่อดู${label}ถัดไป`:`${label} 1 รายการ`}>
   {blocks.map((block,index)=><div className="hc-card-slide" role="group" aria-roledescription="slide" aria-label={`${label} ${index+1} จาก ${blocks.length}: ${block.title}`} key={block.id}><HubContentBlock block={block} href={href(block)} onDemoClick={onDemoClick}/></div>)}
  </div>
  {blocks.length>1&&(compactCards?
   <div className="hc-card-compact-controls">
    <span aria-live="polite">{current+1} / {blocks.length} <span aria-hidden="true">· เลื่อนดูสินค้า</span></span>
    <div>
     <button type="button" aria-label="สินค้าก่อนหน้า" aria-controls={railId} disabled={!edges.prev} onClick={()=>stepCompact(-1)}><ChevronLeft size={18}/></button>
     <button type="button" aria-label="สินค้าถัดไป" aria-controls={railId} disabled={!edges.next} onClick={()=>stepCompact(1)}><ChevronRight size={18}/></button>
    </div>
   </div>
  :<>
    <span className="hc-card-floating-count" aria-live="polite">{current+1} / {blocks.length}</span>
    <button className="hc-card-float-arrow hc-card-float-prev" type="button" aria-label="สินค้าก่อนหน้า" aria-controls={railId} disabled={current===0} onClick={()=>move(current-1)}><ChevronLeft size={19}/></button>
    <button className="hc-card-float-arrow hc-card-float-next" type="button" aria-label="สินค้าถัดไป" aria-controls={railId} disabled={current===blocks.length-1} onClick={()=>move(current+1)}><ChevronRight size={19}/></button>
   </>)}
 </div>;
}
