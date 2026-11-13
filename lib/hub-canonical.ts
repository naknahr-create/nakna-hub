const LEGACY_ORIGIN = 'https://nakna-hub.nakna.workers.dev';
const CANONICAL_ORIGIN = 'https://hub.naknahr.com';

/** Move browser entry points only. Webhooks, APIs and assets keep their URLs. */
export function canonicalHubRedirect(request: Request, configuredOrigin?: string): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const incoming = new URL(request.url);
  if (incoming.origin !== LEGACY_ORIGIN) return null;
  try {
    const configured = new URL(configuredOrigin?.trim() ?? '');
    if (configured.origin !== CANONICAL_ORIGIN || configured.pathname !== '/'
      || configured.username || configured.password || configured.search || configured.hash) return null;
  } catch { return null; }

  const path = incoming.pathname;
  const callback = path === '/auth/line/callback';
  const entryPoint = ['/', '/studio', '/admin', '/privacy', '/terms', '/billing/terms', '/auth/line/start'].includes(path)
    || path.startsWith('/h/') || path.startsWith('/go/');
  if (!entryPoint && !callback) return null;

  const target = new URL(CANONICAL_ORIGIN);
  // OAuth attempts belong to a host-only cookie. Restart on the new host;
  // never forward a previous host's authorization code or state to it.
  target.pathname = callback ? '/studio' : path;
  target.search = callback ? '?auth_error=line_state_invalid' : incoming.search;
  return new Response(null, {status: 302, headers: {
    Location: target.href,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }});
}
