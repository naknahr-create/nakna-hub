import {websiteIcon} from '@/lib/hub-website-icon';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return websiteIcon(request, {cache: await caches.open('hub-website-icons-v1')});
}
export const HEAD = GET;
