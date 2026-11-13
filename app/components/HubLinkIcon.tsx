'use client';

import {useEffect, useState} from 'react';
import {imageAssetId, websiteIconFallback, websiteIconUrl} from '../../lib/hub-link-media';
import {HubIcon} from './ui';
import '../link-media.css';

export function HubLinkIcon({icon = 'auto', url = '', size = 26}:{icon?:string;url?:string;size?:number}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [retriedSource, setRetriedSource] = useState<string | null>(null);
  const assetId = imageAssetId(icon);
  const source = assetId ? `/media/${assetId}` : icon === 'auto' ? websiteIconUrl(url) : null;
  useEffect(() => {setFailedSource(null);setRetriedSource(null);}, [source, icon]);
  useEffect(() => {
    if (!source || icon !== 'auto' || failedSource !== source || retriedSource === source) return;
    const timer = setTimeout(() => {setRetriedSource(source);setFailedSource(null);}, 800);
    return () => clearTimeout(timer);
  }, [source, icon, failedSource, retriedSource]);
  const imageSource = icon === 'auto' && source === retriedSource ? websiteIconUrl(url, true) : source;
  return <span className={`hub-link-visual ${assetId ? 'hub-link-visual-image' : ''}`} style={{width:size,height:size}} aria-hidden="true">
    {imageSource && failedSource !== source ? <img key={imageSource} src={imageSource} alt="" width={size} height={size} decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSource(source)}/> : <HubIcon name={assetId || icon === 'auto' ? websiteIconFallback(url) : icon} size={size}/>}
  </span>;
}
