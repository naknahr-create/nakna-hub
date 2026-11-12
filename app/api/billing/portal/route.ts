import {api, json} from '@/lib/hub-data';
import {createBillingPortal} from '@/lib/hub-billing';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {return api(async () => json(await createBillingPortal(request)));}
