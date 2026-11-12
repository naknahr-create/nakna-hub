import {api,json,setAccountPlan} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function PATCH(r:Request,c:C){return api(async()=>json(await setAccountPlan(r,(await c.params).id)));}
