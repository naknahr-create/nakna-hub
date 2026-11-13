import type {Metadata} from 'next';
import type {HubProfile} from './hub-types';

const DEFAULT_ORIGIN = 'https://hub.naknahr.com';
const UPLOADED_IMAGE = /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Use the configured public origin, never a request Host or a draft URL. */
export function hubShareOrigin(value?: string): string {
  try {
    const url = new URL(value?.trim() ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch { /* A missing deployment setting keeps the canonical production URL. */ }
  return DEFAULT_ORIGIN;
}

function uploadedImage(value: string | undefined, origin: string): string | null {
  return value && UPLOADED_IMAGE.test(value) ? new URL(value, origin).href : null;
}

function publicAvatar(value: string, origin: string): string | null {
  const uploaded = uploadedImage(value, origin);
  if (uploaded) return uploaded;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host.includes('.') && !host.includes(':') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host === '::' || /^(fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/i.test(host) || /^::ffff:/i.test(host)) return null;
    const ip = host.split('.').map(Number);
    if (ip.length === 4 && ip.every(n => Number.isInteger(n) && n >= 0 && n <= 255) && (ip[0] === 0 || ip[0] === 10 || ip[0] === 127 || ip[0] >= 224 || ip[0] === 169 && ip[1] === 254 || ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31 || ip[0] === 192 && ip[1] === 168 || ip[0] === 100 && ip[1] >= 64 && ip[1] <= 127)) return null;
    return url.href;
  } catch { return null; }
}

/** The caller must pass the published profile, not the editable draft. */
export function resolveHubShareImage(profile: HubProfile, appOrigin?: string): string | null {
  const origin = hubShareOrigin(appOrigin);
  return uploadedImage(profile.shareImageUrl, origin) || publicAvatar(profile.avatarUrl, origin);
}

/** Build metadata entirely from a public snapshot. Media serving enforces its publication. */
export function buildHubShareMetadata(profile: HubProfile, slug: string, appOrigin?: string): Metadata {
  const origin = hubShareOrigin(appOrigin);
  const url = `${origin}/h/${encodeURIComponent(slug)}`;
  const title = `${profile.name} | นากนะ HUB`;
  const description = (profile.bio || profile.tagline || `รวมทุกช่องทางของ ${profile.name} ไว้ในฮับเดียว`).replace(/\s+/g, ' ').trim();
  const image = resolveHubShareImage(profile, origin);
  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: {canonical: url},
    openGraph: {
      title, description, url, siteName: 'นากนะ HUB', locale: 'th_TH', type: 'website',
      ...(image ? {images: [{url: image, alt: `ภาพแนะนำ ${profile.name}`}]} : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary', title, description,
      ...(image ? {images: [image]} : {}),
    },
    robots: {index: true, follow: true},
  };
}
