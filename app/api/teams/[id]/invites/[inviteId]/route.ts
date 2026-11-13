import {api,json} from '@/lib/hub-data';
import {revokeTeamInvite} from '@/lib/hub-teams';
export const dynamic='force-dynamic';
export async function DELETE(r:Request,c:{params:Promise<{id:string;inviteId:string}>}){return api(async()=>{const {id,inviteId}=await c.params;await revokeTeamInvite(r,id,inviteId);return json({ok:true});});}
