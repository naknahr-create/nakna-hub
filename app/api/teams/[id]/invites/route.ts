import {api,json} from '@/lib/hub-data';
import {createTeamInvite} from '@/lib/hub-teams';
export const dynamic='force-dynamic';
export async function POST(r:Request,c:{params:Promise<{id:string}>}){return api(async()=>json(await createTeamInvite(r,(await c.params).id),201));}
