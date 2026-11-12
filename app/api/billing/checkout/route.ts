import {api, json} from '@/lib/hub-data';
import {createCheckout} from '@/lib/hub-billing';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {return api(async () => json(await createCheckout(request)));}
