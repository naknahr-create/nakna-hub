'use client';

import {useEffect,useState} from 'react';
import {BUILD_INFO} from '../../lib/build-info.generated';

type BuildInfo={version:string;commit:string;buildId:string;builtAt:string};

function formattedDate(iso:string){
  if(!iso)return 'ยังไม่มีข้อมูล';
  const date=new Date(iso);
  if(Number.isNaN(date.valueOf()))return 'ยังไม่มีข้อมูล';
  return new Intl.DateTimeFormat('th-TH',{
    timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(date);
}

export function BuildVersion({location='sidebar'}:{location?:'sidebar'|'footer'}){
  const [latest,setLatest]=useState<BuildInfo|null>(null);
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{
    let mounted=true;
    async function checkVersion(){
      try{
        const response=await fetch('/api/version',{cache:'no-store'});
        if(!response.ok)return;
        const next:unknown=await response.json();
        if(!next||typeof next!=='object')return;
        const info=next as Partial<BuildInfo>;
        if(typeof info.buildId==='string'&&typeof info.version==='string'&&typeof info.builtAt==='string'&&typeof info.commit==='string'&&mounted){
          setLatest(info as BuildInfo);
        }
      }catch{/* Keep showing the deployed version even without network access. */}
    }
    void checkVersion();
    const interval=window.setInterval(()=>{
      if(document.visibilityState==='visible')void checkVersion();
    },90_000);
    const whenVisible=()=>{if(document.visibilityState==='visible')void checkVersion();};
    document.addEventListener('visibilitychange',whenVisible);
    return ()=>{mounted=false;window.clearInterval(interval);document.removeEventListener('visibilitychange',whenVisible);};
  },[]);

  const id=BUILD_INFO.commit?BUILD_INFO.commit.slice(0,7):BUILD_INFO.buildId;
  const hasUpdate=!!latest&&latest.buildId!=='not-built'&&latest.buildId!==BUILD_INFO.buildId;
  return <div className={`hub-build-version hub-build-${location}`} data-update={hasUpdate?'true':undefined}>
    <button type="button" className="hub-build-trigger" aria-expanded={expanded}
      aria-label={`เวอร์ชันเว็บไซต์ ${BUILD_INFO.version} บิลด์ ${id}${hasUpdate?' มีอัปเดตใหม่':''}`}
      onClick={()=>setExpanded(value=>!value)}>
      <span>เวอร์ชัน v{BUILD_INFO.version} · {id}</span>
      {hasUpdate&&<strong className="hub-build-new">มีอัปเดตใหม่</strong>}
    </button>
    {expanded&&<div className="hub-build-details">
      <span>เวอร์ชันที่กำลังใช้งาน</span>
      <strong>v{BUILD_INFO.version} · {id}</strong>
      <span>Build: {formattedDate(BUILD_INFO.builtAt)}</span>
      {hasUpdate?<><span role="status">มีเวอร์ชันใหม่พร้อมใช้งานบนเว็บไซต์แล้ว</span><button type="button" className="hub-build-reload" onClick={()=>window.location.reload()}>โหลดเวอร์ชันใหม่</button></>:<span>รหัสบิลด์ใช้ตรวจสอบว่าเว็บอัปเดตแล้วหรือยัง</span>}
    </div>}
  </div>;
}
