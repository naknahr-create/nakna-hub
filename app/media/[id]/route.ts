import {api,serveAsset} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function GET(r:Request,c:C){return api(async()=>serveAsset(r,(await c.params).id));}
export async function HEAD(r:Request,c:C){return api(async()=>serveAsset(r,(await c.params).id));}
