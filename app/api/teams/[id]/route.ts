import {api,json} from '@/lib/hub-data';
import {getTeam,updateTeam,deleteTeam} from '@/lib/hub-teams';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function GET(r:Request,c:C){return api(async()=>json(await getTeam(r,(await c.params).id)));}
export async function PATCH(r:Request,c:C){return api(async()=>json(await updateTeam(r,(await c.params).id)));}
export async function DELETE(r:Request,c:C){return api(async()=>{await deleteTeam(r,(await c.params).id);return json({ok:true});});}
