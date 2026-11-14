import {api,json,saveLinksBatch} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:C){
  return api(async()=>{
    const {id}=await context.params;
    return json(await saveLinksBatch(request,id));
  });
}
