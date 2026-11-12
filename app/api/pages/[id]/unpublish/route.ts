import {api,json,publishPage,unpublishPage} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function POST(r:Request,c:C){return api(async()=>json(await unpublishPage(r,(await c.params).id)));}
