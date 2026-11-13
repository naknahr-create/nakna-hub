import {api,json} from '@/lib/hub-data';
import {getTeamInvite,acceptTeamInvite} from '@/lib/hub-teams';
export const dynamic='force-dynamic';
type C={params:Promise<{token:string}>};
export async function GET(r:Request,c:C){return api(async()=>json(await getTeamInvite(r,(await c.params).token)));}
export async function POST(r:Request,c:C){return api(async()=>json(await acceptTeamInvite(r,(await c.params).token)));}
