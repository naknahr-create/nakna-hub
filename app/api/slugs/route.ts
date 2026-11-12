import {api,json,checkSlug} from '@/lib/hub-data';
export const dynamic='force-dynamic';
export async function GET(r:Request){return api(async()=>json(await checkSlug(r)));}
