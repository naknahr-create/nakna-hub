import {api,json} from '@/lib/hub-data';
import {adminUpdateAccount} from '@/lib/hub-admin';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function PATCH(r:Request,c:C){return api(async()=>json(await adminUpdateAccount(r,(await c.params).id)));}
