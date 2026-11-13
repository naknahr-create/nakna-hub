import {api,json} from '@/lib/hub-data';
import {adminUpdateHub} from '@/lib/hub-admin';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function PATCH(r:Request,c:C){return api(async()=>json(await adminUpdateHub(r,(await c.params).id)));}
