'use client';

import {useEffect,useState,type CSSProperties} from 'react';
import {ArrowUpRight,Link2} from 'lucide-react';
import type {HubLink,HubProfile} from '../../lib/hub-types';
import {applyHubTheme,getHubTheme,getHubThemeCssVars} from '../../lib/hub-themes';
import '../hub-themes.css';

/** A quiet, non-interactive preview: never mounts tracking or destination links. */
export function HubThemeThumbnail({profile,links=[],themeId}:{profile:HubProfile;links?:HubLink[];themeId:string}){
  const preset=getHubTheme(themeId);
  const appearance=preset?applyHubTheme(profile,themeId):profile;
  const [imageFailed,setImageFailed]=useState(false);
  useEffect(()=>setImageFailed(false),[profile.avatarUrl]);
  const initials=[...(profile.name||'N').trim()].slice(0,2).join('');
  // Gallery tiles do not contact 24 third-party image hosts. Uploaded media is
  // served by our existing authorized endpoint; other avatars use initials.
  const avatar=/^\/media\/[A-Za-z0-9-]+$/.test(profile.avatarUrl)?profile.avatarUrl:'';
  const currentLinks=links.filter(link=>link.type!=='heading'&&link.enabled&&!link.archived).sort((a,b)=>a.sortOrder-b.sortOrder).slice(0,3);
  const titles=currentLinks.length?currentLinks.map(link=>link.title):['เว็บไซต์ของฉัน','เรื่องราวและผลงาน','ติดต่อพูดคุย'];
  const style={...getHubThemeCssVars(appearance),'--hc-accent':appearance.accent} as CSSProperties;

  return <div className={`ht-thumb ht-style-${preset?.style||'minimal'} ht-layout-${appearance.layout}`} style={style} data-theme={preset?.id} aria-hidden="true">
    <div className="ht-thumb-art"><i/><i/><i/></div>
    <div className="ht-thumb-content">
      <div className="ht-thumb-topline"><span>{profile.handle||'YOUR SPACE'}</span><i/></div>
      <div className="ht-thumb-profile">
        <span className="ht-thumb-avatar">{avatar&&!imageFailed?<img src={avatar} alt="" loading="lazy" decoding="async" onError={()=>setImageFailed(true)}/>:initials}</span>
        <div className="ht-thumb-identity"><strong>{profile.name||'ชื่อของคุณ'}</strong><span>{profile.tagline||profile.bio||'ทุกช่องทาง ในพื้นที่ของคุณ'}</span></div>
      </div>
      <div className="ht-thumb-rule"><span/><ArrowUpRight size={10}/></div>
      <div className="ht-thumb-links">{titles.map((title,index)=><div className="ht-thumb-link" key={index}><span className="ht-thumb-link-number">{String(index+1).padStart(2,'0')}</span><span className="ht-thumb-link-icon"><Link2 size={9}/></span><span className="ht-thumb-link-title">{title}</span><ArrowUpRight size={9}/></div>)}</div>
      <span className="ht-thumb-signature">{appearance.showBranding?'นากนะ HUB':'YOUR OWN SPACE'}</span>
    </div>
  </div>;
}

export default HubThemeThumbnail;
