import {api,json,updateLink,archiveLink} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string;linkId:string}>};
export async function PATCH(r:Request,c:C){return api(async()=>{const {id,linkId}=await c.params;return json({link:await updateLink(r,id,linkId)});});}
export async function DELETE(r:Request,c:C){return api(async()=>{const {id,linkId}=await c.params;await archiveLink(r,id,linkId);return json({ok:true});});}
