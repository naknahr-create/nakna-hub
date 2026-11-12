import type {Metadata} from 'next';
import {headers} from 'next/headers';
import PublicHub from '../../components/PublicHub';
import {getPublicHub,HubError} from '../../../lib/hub-data';
export const dynamic='force-dynamic';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {slug}=await params;
 try{const data=await getPublicHub(new Request('https://hub.local/'),slug);const title=data.profile.name+' | นากนะ HUB';const description=data.profile.bio||data.profile.tagline||'รวมทุกช่องทางของ '+data.profile.name+' ไว้ในฮับเดียว';return {title,description,openGraph:{title,description,type:'profile'},robots:{index:true,follow:true}};}
 catch{return {title:'ยังเปิดฮับนี้ไม่ได้ | นากนะ HUB',robots:{index:false,follow:false}};}
}
export default async function HubPage({params}:Props){
 const {slug}=await params;
 try{const data=await getPublicHub(new Request('https://hub.local/',{headers:await headers()}),slug);return <PublicHub key={slug} slug={slug} initialData={data}/>;}
 catch(error){if(!(error instanceof HubError))console.error('Public hub rendering failed');return <PublicHub key={slug} slug={slug}/>;}
}
