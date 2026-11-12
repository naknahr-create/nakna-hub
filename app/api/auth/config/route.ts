import { env } from 'cloudflare:workers';
import { getAuthConfiguration } from '@/lib/hub-auth';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(getAuthConfiguration(env), {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
