import {api,json,getPublicHub} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{slug:string}>};
export async function GET(r:Request,c:C){return api(async()=>json(await getPublicHub(r,(await c.params).slug)));}
