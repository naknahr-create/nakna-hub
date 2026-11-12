import {api,exportAnalytics} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function GET(r:Request,c:C){return api(()=>c.params.then(p=>exportAnalytics(r,p.id)));}
