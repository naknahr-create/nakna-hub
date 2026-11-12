import {api,goToLink} from '@/lib/hub-data';
export const dynamic='force-dynamic';
type C={params:Promise<{slug:string;linkId:string}>};
export async function GET(r:Request,c:C){return api(async()=>{const {slug,linkId}=await c.params;return goToLink(r,slug,linkId);});}
export async function HEAD(r:Request,c:C){return api(async()=>{const {slug,linkId}=await c.params;return goToLink(r,slug,linkId);});}
