import {api,json,requestUpgrade} from '@/lib/hub-data';
export const dynamic='force-dynamic';
export async function POST(r:Request){return api(async()=>{await requestUpgrade(r);return json({ok:true});});}
