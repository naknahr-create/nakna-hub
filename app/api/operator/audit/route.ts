import {api,json} from '@/lib/hub-data';
import {adminAudit} from '@/lib/hub-admin';
export const dynamic='force-dynamic';
export async function GET(r:Request){return api(async()=>json(await adminAudit(r)));}
