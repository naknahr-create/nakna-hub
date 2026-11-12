import {api, json} from '@/lib/hub-data';
import {receiveStripeWebhook} from '@/lib/hub-billing';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {return api(async () => json(await receiveStripeWebhook(request)));}
