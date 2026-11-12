'use client';

import {useState} from 'react';
import {imageAssetId, websiteIconUrl} from '../../lib/hub-link-media';
import {HubIcon} from './ui';
import '../link-media.css';

export function HubLinkIcon({icon = 'auto', url = '', size = 26}:{icon?:string;url?:string;size?:number}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const assetId = imageAssetId(icon);
  const source = assetId ? `/media/${assetId}` : icon === 'auto' ? websiteIconUrl(url) : null;
  return <span className={`hub-link-visual ${assetId ? 'hub-link-visual-image' : ''}`} style={{width:size,height:size}} aria-hidden="true">
    {source && failedSource !== source ? <img src={source} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSource(source)}/> : <HubIcon name={assetId || icon === 'auto' ? url.startsWith('mailto:') ? 'mail' : 'link' : icon} size={size}/>}
  </span>;
}
