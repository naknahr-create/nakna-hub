import {api, json} from '@/lib/hub-data';
import {syncBilling} from '@/lib/hub-billing';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {return api(async () => json(await syncBilling(request)));}
