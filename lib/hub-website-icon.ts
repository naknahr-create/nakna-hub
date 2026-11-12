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

/**
 * Resolve website icons through a fixed favicon provider. Never fetch a user URL
 * or forward visitor credentials. The provider receives only the public domain.
 * Uploaded custom images are independent of this best-effort service.
 */
export async function websiteIcon(request: Request, dependencies: Dependencies = {}): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
  const url = new URL(request.url);
  const domain = iconDomain(url.searchParams.get('domain') ?? '');
  if (!domain || url.searchParams.getAll('domain').length !== 1 || [...url.searchParams.keys()].some(key => key !== 'domain')) {
    return new Response(null, {status: 400, headers: {'Cache-Control': 'no-store'}});
  }
  const cacheKey = new Request(`${url.origin}/api/link-icon?domain=${encodeURIComponent(domain)}`);
  const cached = await dependencies.cache?.match(cacheKey).catch(() => undefined);
  if (cached) return request.method === 'HEAD' ? new Response(null, cached) : cached;

  const headers = {'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin'};
  let result: Response;
  try {
    const fetcher = dependencies.fetcher ?? fetch;
    const upstream = await fetcher(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: {Accept: 'image/png,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/webp,image/gif'},
    });
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      throw new Error('icon_unavailable');
    }
    const bytes = await readIcon(upstream);
    const mime = imageType(bytes);
    if (!mime) throw new Error('icon_unsupported');
    result = new Response(bytes.buffer as ArrayBuffer, {headers: {...headers, 'Content-Type': mime, 'Content-Length': String(bytes.byteLength)}});
  } catch {
    // An unavailable icon must never prevent a link from rendering or opening.
    result = new Response(null, {status: 404, headers: {...headers, 'Cache-Control': 'public, max-age=300'}});
  }
  await dependencies.cache?.put(cacheKey, result.clone()).catch(() => {});
  return request.method === 'HEAD' ? new Response(null, result) : result;
}
