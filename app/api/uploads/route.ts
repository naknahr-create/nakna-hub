import {api,json,uploadAsset} from '@/lib/hub-data';
export const dynamic='force-dynamic';
export async function POST(r:Request){return api(async()=>json(await uploadAsset(r),201));}
