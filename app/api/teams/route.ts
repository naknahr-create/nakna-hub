import {api,json} from '@/lib/hub-data';
import {listTeams,createTeam} from '@/lib/hub-teams';
export const dynamic='force-dynamic';
export async function GET(r:Request){return api(async()=>json(await listTeams(r)));}
export async function POST(r:Request){return api(async()=>json(await createTeam(r),201));}
