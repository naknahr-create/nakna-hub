import {api,json,analytics} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function GET(r:Request,c:C){return api(async()=>json(await analytics(r,(await c.params).id)));}
