import {api,json,createLink} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function POST(r:Request,c:C){return api(async()=>json({link:await createLink(r,(await c.params).id)},201));}
