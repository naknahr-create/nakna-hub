import {api,json} from '@/lib/hub-data';
import {updateTeamMember,revokeTeamMember} from '@/lib/hub-teams';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string;memberId:string}>};
export async function PATCH(r:Request,c:C){return api(async()=>{const {id,memberId}=await c.params;return json(await updateTeamMember(r,id,memberId));});}
export async function DELETE(r:Request,c:C){return api(async()=>{const {id,memberId}=await c.params;return json(await revokeTeamMember(r,id,memberId));});}
