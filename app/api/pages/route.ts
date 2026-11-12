import {api,json,createPage} from '@/lib/hub-data';
export const dynamic='force-dynamic';
export async function POST(r:Request){return api(async()=>json(await createPage(r),201));}
