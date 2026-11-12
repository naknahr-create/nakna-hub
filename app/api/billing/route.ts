import {api, json} from '@/lib/hub-data';
import {getBillingStatus} from '@/lib/hub-billing';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return api(async () => json(await getBillingStatus(request)));}
