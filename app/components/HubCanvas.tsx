'use client';
import {useEffect,useState,type CSSProperties} from 'react';
import {ArrowUpRight,ArrowRight,MoveUpRight,Sparkles} from 'lucide-react';
import type {HubProfile,HubLink} from '../../lib/hub-types';
import {HubBrand} from './ui';
import {HubLinkIcon} from './HubLinkIcon';
import {HubContentBlock} from './HubContentBlock';
import {HubCardCarousel} from './HubCardCarousel';
import {getHubTheme,getHubThemeCssVars} from '../../lib/hub-themes';
import '../hub-themes.css';
import '../hub-content.css';

export function HubCanvas({profile,links,slug='',preview=false,compact=false,onDemoClick}:{profile:HubProfile;links:HubLink[];slug?:string;preview?:boolean;compact?:boolean;onDemoClick?:(title:string)=>void}){
 const [source,setSource]=useState('');
 const [imageFailed,setImageFailed]=useState(false);
 useEffect(()=>setImageFailed(false),[profile.avatarUrl]);
 useEffect(()=>{if(preview)return;let ref='';try{const r=new URL(document.referrer);if(r.origin!==location.origin)ref=r.hostname;}catch{}setSource((new URLSearchParams(location.search).get('utm_source')||ref).slice(0,100));},[preview]);
 const productCards=visible.filter(l=>l.type==='service');
 const visible=links.filter(l=>l.enabled&&!l.archived).sort((a,b)=>a.sortOrder-b.sortOrder);
 const themePreset=getHubTheme(profile.themeId);
 const accent=profile.accent||'#04878a';
 const luminance=(color:string)=>{const [r,g,b]=[1,3,5].map(i=>{const c=parseInt(color.slice(i,i+2),16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
 const accentLuminance=luminance(accent);
 const darkContrast=(accentLuminance+.05)/(luminance('#173536')+.05);
 const whiteContrast=1.05/(accentLuminance+.05);
 const accentInk=darkContrast>=whiteContrast?'#173536':'#ffffff';
 const initials=[...profile.name.trim()].slice(0,2).join('')||'N';
 const href=(l:HubLink)=>preview?l.url:`/go/${encodeURIComponent(slug)}/${encodeURIComponent(l.id)}${source?'?src='+encodeURIComponent(source):''}`;
 return <div className={`hc hc-${profile.layout} hc-bg-${profile.background} hc-${profile.theme} ${compact?'hc-compact':''} ${themePreset?`hc-themed hc-style-${themePreset.style}`:''}`} data-theme={themePreset?.id} style={{...getHubThemeCssVars(profile),'--hc-accent':accent,'--hc-accent-ink':accentInk} as CSSProperties}>
   {themePreset&&<div className="hc-theme-art" aria-hidden="true"><i/><i/><i/></div>}
   <div className="hc-inner"><section className="hc-profile">
     <div className="hc-topline"><span>{profile.handle?(profile.handle.startsWith('@')?profile.handle:'@'+profile.handle):slug?'@'+slug:'YOUR OWN SPACE'}</span><span className="hc-orbit" aria-hidden="true"><i/><i/><i/></span></div>
     <div className="hc-profile-main"><div className="hc-avatar">{profile.avatarUrl&&!imageFailed?<img src={profile.avatarUrl} alt={profile.name} onError={()=>setImageFailed(true)}/>:<span>{initials}</span>}</div><div className="hc-identity-copy">{profile.tagline&&<p className="hc-tagline">{profile.tagline}</p>}<h1>{profile.name||'ชื่อของคุณ'}</h1>{profile.bio&&<p className="hc-bio">{profile.bio}</p>}</div></div>
     <div className="hc-profile-rule"><span/><ArrowRight size={17}/></div>
   </section><section className="hc-links" aria-label="เนื้อหาของหน้าเว็บ">
     {visible.map((l,index)=>l.type==='service'?(l.id!==productCards[0]?.id?null:<HubCardCarousel key={l.id} blocks={productCards} href={item=>item.url?href(item):undefined} onDemoClick={onDemoClick}/>):l.type==='heading'?<h2 key={l.id} className="hc-section-label">{l.title}</h2>:l.type!=='link'?<HubContentBlock key={l.id} block={l} href={l.url?href(l):undefined} onDemoClick={onDemoClick}/>:<a key={l.id} className={`hc-link ${l.featured?'hc-link-featured':''}`} href={href(l)} target="_blank" rel="noopener" aria-label={`${l.title} เปิดในแท็บใหม่`} onClick={e=>{if(onDemoClick){e.preventDefault();onDemoClick(l.title);}}}>
       <span className="hc-link-number">{String(index+1).padStart(2,'0')}</span><span className="hc-link-icon"><HubLinkIcon icon={l.icon} url={l.url} size={30}/></span><span className="hc-link-copy"><span className="hc-link-title">{l.title}</span>{l.description&&<span className="hc-link-description">{l.description}</span>}</span><ArrowUpRight className="hc-link-arrow" size={20}/>{l.featured&&<span className="hc-featured-label"><Sparkles size={11}/> แนะนำ</span>}
     </a>)}
     {!visible.length&&<div className="hc-empty"><span className="hc-empty-symbol"><MoveUpRight size={26}/></span><h2>พื้นที่ดี ๆ กำลังเริ่มต้น</h2><p>{preview?'เพิ่มเนื้อหาแรก แล้วดูหน้าของคุณตรงนี้':'กลับมาพบกันเร็ว ๆ นี้'}</p></div>}
   </section></div>
   {profile.showBranding&&<footer className="hc-footer"><span>พื้นที่เล็ก ๆ ที่เป็นคุณ</span><a href="/" target={preview?'_blank':undefined} rel="noopener" aria-label="สร้างฮับของคุณด้วยนากนะ HUB"><HubBrand compact/></a></footer>}
 </div>;
}
