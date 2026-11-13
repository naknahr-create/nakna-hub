import {iconDomain} from './hub-link-media';

type IconCache = Pick<Cache, 'match' | 'put'>;
type Dependencies = {fetcher?: typeof fetch; cache?: IconCache};
const MAX_ICON_BYTES = 256 * 1024;

function imageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0 && (bytes[4] || bytes[5])) return 'image/x-icon';
  const header = new TextDecoder().decode(bytes.subarray(0, 12));
  if (/^GIF8[79]a/.test(header)) return 'image/gif';
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function readIcon(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > MAX_ICON_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error('icon_too_large');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('icon_empty');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ICON_BYTES) throw new Error('icon_too_large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
  return bytes;
}

function googleIconRedirect(location: string | null, domain: string): string | null {
  if (!location) return null;
  try {
    const target = new URL(location);
    if (target.origin !== 'https://t0.gstatic.com' || target.pathname !== '/faviconV2' || target.username || target.password || target.hash) return null;
    const allowed = ['client', 'type', 'fallback_opts', 'url', 'size'];
    if ([...target.searchParams.keys()].some(key => !allowed.includes(key)) || allowed.some(key => target.searchParams.getAll(key).length !== 1)) return null;
    if (target.searchParams.get('client') !== 'SOCIAL' || target.searchParams.get('type') !== 'FAVICON' || target.searchParams.get('fallback_opts') !== 'TYPE,SIZE,URL' || target.searchParams.get('size') !== '64') return null;
    const source = new URL(target.searchParams.get('url')!);
    if (!['http:', 'https:'].includes(source.protocol) || source.hostname !== domain || source.port || source.username || source.password || source.pathname !== '/' || source.search || source.hash) return null;
    return target.href;
  } catch { return null; }
}

async function fetchIcon(url: string, domain: string, fetcher: typeof fetch, google: boolean): Promise<{bytes: Uint8Array; mime: string}> {
  // One provider's entire request (including its one allowed redirect and body)
  // has a three-second deadline. At most two providers are attempted.
  const options: RequestInit = {method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(3000), headers: {Accept: 'image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon'}};
  let upstream = await fetcher(url, options);
  if (google && [301, 302, 303, 307, 308].includes(upstream.status)) {
    const target = googleIconRedirect(upstream.headers.get('location'), domain);
    await upstream.body?.cancel().catch(() => {});
    if (!target) throw new Error('icon_redirect_blocked');
    upstream = await fetcher(target, options);
  }
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => {});
    throw new Error('icon_unavailable');
  }
  const bytes = await readIcon(upstream);
  const mime = imageType(bytes);
  if (!mime) throw new Error('icon_unsupported');
  return {bytes, mime};
}

/**
 * Resolve website icons through fixed favicon providers. Never fetch a user URL
 * or forward visitor credentials. Providers receive only the public domain.
 * Uploaded custom images are independent of this best-effort service.
 */
export async function websiteIcon(request: Request, dependencies: Dependencies = {}): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
  const url = new URL(request.url);
  const domain = iconDomain(url.searchParams.get('domain') ?? '');
  const version = url.searchParams.get('v'), retry = url.searchParams.get('retry');
  if (!domain || url.searchParams.getAll('domain').length !== 1 || [...url.searchParams.keys()].some(key => !['domain', 'v', 'retry'].includes(key)) || url.searchParams.getAll('v').length > 1 || (version !== null && version !== '2') || url.searchParams.getAll('retry').length > 1 || (retry !== null && retry !== '1')) {
    return new Response(null, {status: 400, headers: {'Cache-Control': 'no-store'}});
  }
  const cacheKey = new Request(`${url.origin}/api/link-icon?domain=${encodeURIComponent(domain)}&v=2`);
  const cached = retry ? undefined : await dependencies.cache?.match(cacheKey).catch(() => undefined);
  if (cached?.ok && /^image\/(?:png|jpeg|webp|gif|x-icon)$/.test(cached.headers.get('content-type') ?? '')) return request.method === 'HEAD' ? new Response(null, cached) : cached;

  const headers = {'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin'};
  const fetcher = dependencies.fetcher ?? fetch;
  const providers = [
    {url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, google: true},
    {url: `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`, google: false},
  ];
  // A browser retry may mean a decode failure, not just a network error.
  // Prefer the independent image source rather than serving the same bytes.
  if (retry) providers.reverse();
  for (const provider of providers) {
    try {
      const {bytes, mime} = await fetchIcon(provider.url, domain, fetcher, provider.google);
      const result = new Response(bytes.buffer as ArrayBuffer, {headers: {...headers, 'Content-Type': mime, 'Content-Length': String(bytes.byteLength)}});
      await dependencies.cache?.put(cacheKey, result.clone()).catch(() => {});
      return request.method === 'HEAD' ? new Response(null, result) : result;
    } catch {
      // Try the independent provider before showing a local fallback icon.
    }
  }
  // Do not pin a temporary provider failure into the browser or edge cache.
  return new Response(null, {status: 404, headers: {...headers, 'Cache-Control': 'no-store'}});
}
