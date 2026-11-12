import {api,json,getPage,updatePage,archivePage} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function GET(r:Request,c:C){return api(async()=>json(await getPage(r,(await c.params).id)));}
export async function PATCH(r:Request,c:C){return api(async()=>json(await updatePage(r,(await c.params).id)));}
export async function DELETE(r:Request,c:C){return api(async()=>{await archivePage(r,(await c.params).id);return json({ok:true});});}
