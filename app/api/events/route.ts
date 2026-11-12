import {api,json,recordView} from '@/lib/hub-data';
export const dynamic='force-dynamic';
export async function POST(r:Request){return api(async()=>{await recordView(r);return json({ok:true});});}
