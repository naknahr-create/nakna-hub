import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {env} from 'cloudflare:workers';
import PublicHub from '../../components/PublicHub';
import {getPublicHub,HubError} from '../../../lib/hub-data';
import {buildHubShareMetadata,hubShareOrigin} from '../../../lib/hub-share';
export const dynamic='force-dynamic';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {slug}=await params;
 try{const data=await getPublicHub(new Request(`${hubShareOrigin(env.APP_ORIGIN)}/h/${encodeURIComponent(slug)}`),slug);return buildHubShareMetadata(data.profile,data.slug,env.APP_ORIGIN);}
 catch{return {title:'ยังเปิดฮับนี้ไม่ได้ | นากนะ HUB',robots:{index:false,follow:false}};}
}
export default async function HubPage({params}:Props){
 const {slug}=await params;
 try{const data=await getPublicHub(new Request(`${hubShareOrigin(env.APP_ORIGIN)}/h/${encodeURIComponent(slug)}`,{headers:await headers()}),slug);return <PublicHub key={slug} slug={slug} initialData={data}/>;}
 catch(error){if(!(error instanceof HubError))console.error('Public hub rendering failed');return <PublicHub key={slug} slug={slug}/>;}
}
