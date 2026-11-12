import {createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey} from 'jose';

/** Standalone Workers have no Sites gateway: never trust inbound identity headers. */
export type AccessEnvironment = {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
};
type AccessConfiguration = {issuer: string; audience: string};
const keySets = new Map<string, JWTVerifyGetKey>();

export function accessConfiguration(env: AccessEnvironment): AccessConfiguration | null {
  const domain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!domain || !audience || !/^[a-f0-9]{64}$/i.test(audience)) return null;
  try {
    const url = new URL(domain);
    if (url.protocol !== 'https:' || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/i.test(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return null;
    return {issuer: url.origin, audience};
  } catch { return null; }
}

function remoteKeys(config: AccessConfiguration): JWTVerifyGetKey {
  let keys = keySets.get(config.issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
    // Only configured team domains are used; keep memory bounded across environments.
    if (keySets.size >= 8) keySets.delete(keySets.keys().next().value!);
    keySets.set(config.issuer, keys);
  }
  return keys;
}

/** Optional key resolver is used only by offline signature-verification tests. */
export async function authenticateAccessRequest(
  request: Request,
  env: AccessEnvironment,
  keyResolver?: JWTVerifyGetKey,
): Promise<Request> {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith('oai-authenticated-')) headers.delete(name);
  }
  const config = accessConfiguration(env);
  // Header first; cookie supports identity on otherwise public hub/media routes.
  // Both are untrusted inputs until the same signature and claims checks pass.
  const token = request.headers.get('cf-access-jwt-assertion')
    || request.headers.get('cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if (config && token && token.length <= 16_384) {
    try {
      const {payload} = await jwtVerify(token, keyResolver ?? remoteKeys(config), {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'nbf', 'sub', 'email', 'type'],
        clockTolerance: 5,
      });
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      if (payload.type === 'app' && typeof payload.sub === 'string' && payload.sub.length > 0
        && payload.sub.length <= 256 && !/[\u0000-\u001f\u007f]/.test(payload.sub)
        && typeof payload.iat === 'number' && payload.iat <= Date.now() / 1000 + 5
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) {
        // Namespace identities by provider and issuer so unrelated tenants cannot collide.
        const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 120) : email.split('@')[0];
        const encodedName = encodeURIComponent(name || email.split('@')[0]);
        headers.set('oai-authenticated-user-id', `cf-access:${config.issuer}:${payload.sub}`);
        headers.set('oai-authenticated-user-email', email);
        headers.set('oai-authenticated-user-full-name', encodedName);
        headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
      }
    } catch {
      // An invalid/expired token or unavailable keys leave the request anonymous.
      // Never log tokens, fall back to headers, or bypass ownership checks.
    }
  }
  return new Request(request, {headers});
}
