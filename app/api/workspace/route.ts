import {api,json,getWorkspace} from '@/lib/hub-data';
export const dynamic='force-dynamic';
export async function GET(r:Request){return api(async()=>json(await getWorkspace(r)));}
