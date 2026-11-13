/** Shared, browser-safe helpers for the stored link icon choice. */
const IMAGE_ICON = /^image:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function imageAssetId(icon: string): string | null {
  return typeof icon === 'string' ? IMAGE_ICON.exec(icon)?.[1].toLowerCase() ?? null : null;
}

/** Accept a public DNS hostname, never a URL, IP address, path or credential. */
export function iconDomain(value: string): string | null {
  const domain = value.trim().toLowerCase();
  if (!domain || domain.length > 253 || !domain.includes('.') || /[^a-z0-9.-]/.test(domain)) return null;
  const labels = domain.split('.');
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (!/[a-z]/.test(labels[labels.length - 1])) return null;
  if (/(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion|home|lan)$/.test(domain)) return null;
  return domain;
}

export function websiteIconUrl(value: string, retry = false): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const domain = iconDomain(url.hostname);
    return domain ? `/api/link-icon?domain=${encodeURIComponent(domain)}&v=2${retry ? '&retry=1' : ''}` : null;
  } catch { return null; }
}

/** A useful local fallback when an automatic website image is unavailable. */
export function websiteIconFallback(value: string): string {
  if (value.startsWith('mailto:')) return 'mail';
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube';
    if (/(^|\.)(facebook\.com|fb\.com)$/.test(host)) return 'facebook';
    if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
    if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
    if (/(^|\.)(line\.me|lin\.ee)$/.test(host)) return 'line';
  } catch {}
  return 'link';
}
