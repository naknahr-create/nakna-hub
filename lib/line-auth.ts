/** Server-only LINE Login. Provider tokens are used once and never stored. */
export type LineEnvironment = {
  DB?: D1Database;
  APP_ORIGIN?: string;
  LINE_LOGIN_CHANNEL_ID?: string;
  LINE_LOGIN_CHANNEL_SECRET?: string;
  LINE_OFFICIAL_ACCOUNT_URL?: string;
};
export type LineConfiguration = {origin: string; channelId: string; channelSecret: string; callbackUrl: string; offerFriend: boolean};
type AuthDependencies = {fetcher?: typeof fetch; now?: () => number};
type AttemptRow = {
  state_hash: string; browser_hash: string; verifier: string; nonce: string;
  login_channel_id: string; origin: string; return_to: string; expires_at: number;
};
type SessionRow = {
  user_id: string; line_user_id: string; login_channel_id: string;
  origin: string; display_name: string; email: string; expires_at: number;
};
type JsonObject = Record<string, unknown>;
type AuthFailureStage = 'begin_login' | 'claim_attempt' | 'provider_callback' | 'token' | 'verify' | 'friendship' | 'persist_session' | 'callback';
type AuthFailureCategory = 'database_error' | 'upstream_http' | 'upstream_invalid_client' | 'upstream_invalid_grant' | 'upstream_invalid_request' | 'upstream_unauthorized_client' | 'upstream_server_error' | 'upstream_temporarily_unavailable' | 'timeout' | 'network_error' | 'invalid_json' | 'invalid_response' | 'response_too_large' | 'empty_response' | 'provider_error' | 'unexpected_error';
class LineAuthFailure extends Error {
  readonly stage: AuthFailureStage;
  readonly category: AuthFailureCategory;
  readonly status?: number;
  constructor(stage: AuthFailureStage, category: AuthFailureCategory, status?: number) {
    super('LINE authentication failed');
    this.stage = stage; this.category = category; this.status = status;
  }
}
function logAuthFailure(error: unknown, fallbackStage: AuthFailureStage): void {
  // Emit only categories created here. Never serialize an exception, upstream
  // body, callback URL, identity, cookie, or OAuth credential into logs.
  const failure = error instanceof LineAuthFailure ? error : new LineAuthFailure(fallbackStage, 'unexpected_error');
  const status = failure.status;
  console.warn('LINE authentication failed', {
    stage: failure.stage, category: failure.category,
    ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? {status} : {}),
  });
}
async function authDatabase<T>(stage: AuthFailureStage, run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch { throw new LineAuthFailure(stage, 'database_error'); }
}

const OAUTH_COOKIE = '__Host-nakna_line_oauth';
const SESSION_COOKIE = '__Host-nakna_session';
const ATTEMPT_MS = 10 * 60_000;
const SESSION_MS = 30 * 24 * 60 * 60_000;
const LINE_USER_ID = /^U[0-9a-f]{32}$/;
const COOKIE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();

function appOrigin(value?: string): string | null {
  try {
    const url = new URL(value?.trim() ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}

export function lineConfiguration(env: LineEnvironment): LineConfiguration | null {
  const origin = appOrigin(env.APP_ORIGIN);
  const channelId = env.LINE_LOGIN_CHANNEL_ID?.trim();
  const channelSecret = env.LINE_LOGIN_CHANNEL_SECRET?.trim();
  if (!origin || !channelId || !/^\d{5,20}$/.test(channelId) || !channelSecret || channelSecret.length < 16 || channelSecret.length > 256) return null;
  let offerFriend = false;
  try {
    const url = new URL(env.LINE_OFFICIAL_ACCOUNT_URL ?? '');
    offerFriend = url.protocol === 'https:' && ['line.me', 'lin.ee'].includes(url.hostname)
      && !url.username && !url.password && !url.port && url.pathname !== '/';
  } catch { /* Login remains available before the Official Account is linked. */ }
  return {origin, channelId, channelSecret, callbackUrl: `${origin}/auth/line/callback`, offerFriend};
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomToken(): string { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
function randomHex(): string { return [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join(''); }
async function hash(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
async function challenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
}
function cookie(request: Request, name: string): string | null {
  const matches = (request.headers.get('cookie') ?? '').split(';').map(x => x.trim())
    .filter(x => x.startsWith(`${name}=`)).map(x => x.slice(name.length + 1));
  return matches.length === 1 && COOKIE_TOKEN.test(matches[0]) ? matches[0] : null;
}
function cookieValue(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({'Location': location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'});
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, {status: 303, headers});
}
function authError(code: string, clear = true, returnTo = '/studio'): Response {
  const destination = new URL(safeReturnTo(returnTo), 'https://return.invalid');
  destination.searchParams.set('auth_error', code);
  return redirect(`${destination.pathname}${destination.search}`, clear ? [cookieValue(OAUTH_COOKIE, '', 0)] : []);
}
function jsonError(status: number, code: string, message: string, allow?: string): Response {
  return Response.json({error: message, code}, {status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(allow ? {Allow: allow} : {}),
  }});
}
function safeReturnTo(value: string | null): string {
  // Customer Studio and the separate operator console are the only login destinations.
  if (!value || value.length > 512 || /[\\\u0000-\u0020\u007f]/.test(value)) return '/studio';
  try {
    const url = new URL(value, 'https://return.invalid');
    if (!value.startsWith('/') || value.startsWith('//') || url.origin !== 'https://return.invalid' || !['/studio', '/admin'].includes(url.pathname) || url.hash) return '/studio';
    return `${url.pathname}${url.search}`;
  } catch { return '/studio'; }
}
function stripIdentity(request: Request): Headers {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.toLowerCase().startsWith('oai-authenticated-')) headers.delete(name);
  return headers;
}

/** Validate the opaque cookie against D1; no caller-supplied identity is retained. */
export async function authenticateLineRequest(request: Request, env: LineEnvironment, now = Date.now()): Promise<Request> {
  const headers = stripIdentity(request);
  const config = lineConfiguration(env);
  const token = cookie(request, SESSION_COOKIE);
  if (config && env.DB && token && new URL(request.url).origin === config.origin) {
    try {
      const session = await env.DB.prepare(`SELECT user_id,line_user_id,login_channel_id,origin,display_name,email,expires_at
        FROM hub_line_sessions WHERE token_hash=? AND login_channel_id=? AND origin=? AND expires_at>?`)
        .bind(await hash(token), config.channelId, config.origin, now).first<SessionRow>();
      if (session && LINE_USER_ID.test(session.line_user_id)
        && session.user_id === `line:${config.channelId}:${session.line_user_id}`) {
        headers.set('oai-authenticated-user-id', session.user_id);
        // LINE email scope is intentionally not required and no email is invented.
        if (session.email) headers.set('oai-authenticated-user-email', session.email);
        headers.set('oai-authenticated-user-full-name', encodeURIComponent(session.display_name));
        headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
        headers.set('oai-authenticated-auth-provider', 'line');
      }
    } catch { /* An unavailable database never turns an unverified caller into a user. */ }
  }
  return new Request(request, {headers});
}

async function readJson(response: Response, allowErrorBody = false): Promise<JsonObject> {
  if (!response.ok && !allowErrorBody) throw new Error('line_upstream_failed');
  if (Number(response.headers.get('content-length') ?? 0) > 65_536) throw new Error('line_response_too_large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('line_response_empty');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 65_536) { await reader.cancel(); throw new Error('line_response_too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('line_response_invalid');
  return data as JsonObject;
}
async function lineFetch(fetcher: typeof fetch, url: string, init: RequestInit, stage: AuthFailureStage): Promise<JsonObject> {
  let response: Response;
  // Workers rejects redirect: 'error' before sending the request. Manual mode
  // keeps credentials at this endpoint; the non-2xx guard below rejects 3xx.
  try { response = await fetcher(url, {...init, redirect: 'manual', signal: AbortSignal.timeout(10_000)}); }
  catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    throw new LineAuthFailure(stage, timeout ? 'timeout' : 'network_error');
  }
  if (!response.ok) {
    let category: AuthFailureCategory = 'upstream_http';
    // An error enum can help distinguish a rejected client from an expired code.
    // Ignore all descriptions and unrecognized values; never log the response.
    try {
      const body = await readJson(response, true);
      switch (body.error) {
        case 'invalid_client': category = 'upstream_invalid_client'; break;
        case 'invalid_grant': category = 'upstream_invalid_grant'; break;
        case 'invalid_request': category = 'upstream_invalid_request'; break;
        case 'unauthorized_client': category = 'upstream_unauthorized_client'; break;
        case 'server_error': category = 'upstream_server_error'; break;
        case 'temporarily_unavailable': category = 'upstream_temporarily_unavailable'; break;
      }
    } catch { /* HTTP status remains available if the bounded body cannot be read. */ }
    throw new LineAuthFailure(stage, category, response.status);
  }
  try { return await readJson(response); }
  catch (error) {
    let category: AuthFailureCategory = 'invalid_response';
    if (error instanceof SyntaxError) category = 'invalid_json';
    else if (error instanceof Error) {
      if (['TimeoutError', 'AbortError'].includes(error.name)) category = 'timeout';
      else if (error.message === 'line_response_too_large') category = 'response_too_large';
      else if (error.message === 'line_response_empty') category = 'empty_response';
    }
    throw new LineAuthFailure(stage, category, response.status);
  }
}

async function beginLogin(request: Request, env: LineEnvironment, config: LineConfiguration, now: number): Promise<Response> {
  if (!env.DB) return authError('line_unavailable', true, new URL(request.url).searchParams.get('returnTo') ?? '/studio');
  const browserToken = randomToken(), state = randomHex(), verifier = randomToken(), nonce = randomHex();
  const oldBrowserToken = cookie(request, OAUTH_COOKIE);
  const statements = [env.DB.prepare('DELETE FROM hub_line_auth_attempts WHERE expires_at<=?').bind(now)];
  if (oldBrowserToken) statements.push(env.DB.prepare('DELETE FROM hub_line_auth_attempts WHERE browser_hash=?').bind(await hash(oldBrowserToken)));
  statements.push(env.DB.prepare(`INSERT INTO hub_line_auth_attempts
    (state_hash,browser_hash,verifier,nonce,login_channel_id,origin,return_to,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(await hash(state), await hash(browserToken), verifier, nonce, config.channelId, config.origin,
      safeReturnTo(new URL(request.url).searchParams.get('returnTo')), now, now + ATTEMPT_MS));
  await authDatabase('begin_login', () => env.DB!.batch(statements));
  const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
  authorize.search = new URLSearchParams({response_type: 'code', client_id: config.channelId, redirect_uri: config.callbackUrl,
    state, scope: 'openid profile', nonce, code_challenge: await challenge(verifier), code_challenge_method: 'S256'}).toString();
  if (config.offerFriend) authorize.searchParams.set('bot_prompt', 'normal');
  return redirect(authorize.toString(), [cookieValue(OAUTH_COOKIE, browserToken, ATTEMPT_MS / 1000)]);
}

async function finishLogin(request: Request, env: LineEnvironment, config: LineConfiguration, deps: AuthDependencies): Promise<Response> {
  if (!env.DB) return authError('line_unavailable');
  const now = (deps.now ?? Date.now)();
  const params = new URL(request.url).searchParams;
  const state = params.get('state');
  const browserToken = cookie(request, OAUTH_COOKIE);
  if (!state || !/^[0-9a-f]{64}$/.test(state) || params.getAll('state').length !== 1 || !browserToken) return authError('line_state_invalid');
  // Atomically claim a browser-bound, unexpired attempt before any token exchange.
  const attempt = await authDatabase('claim_attempt', async () => env.DB!.prepare(`DELETE FROM hub_line_auth_attempts
    WHERE state_hash=? AND browser_hash=? AND login_channel_id=? AND origin=? AND expires_at>? RETURNING *`)
    .bind(await hash(state), await hash(browserToken), config.channelId, config.origin, now).first<AttemptRow>());
  if (!attempt) return authError('line_state_invalid');
  const fail = (code: string) => authError(code, true, attempt.return_to);
  try {
  if (params.has('error')) {
    if (params.get('error') === 'access_denied') return fail('line_denied');
    throw new LineAuthFailure('provider_callback', 'provider_error');
  }
  const code = params.get('code');
  if (!code || code.length > 2048 || params.getAll('code').length !== 1) return fail('line_state_invalid');
  const fetcher = deps.fetcher ?? fetch;
  const tokens = await lineFetch(fetcher, 'https://api.line.me/oauth2/v2.1/token', {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'authorization_code', code, redirect_uri: config.callbackUrl,
      client_id: config.channelId, client_secret: config.channelSecret, code_verifier: attempt.verifier}),
  }, 'token');
  if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 16_384
    || typeof tokens.access_token !== 'string' || !tokens.access_token || tokens.access_token.length > 4096) return fail('line_invalid_identity');
  const claims = await lineFetch(fetcher, 'https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({id_token: tokens.id_token, client_id: config.channelId, nonce: attempt.nonce}),
  }, 'verify');
  const checkedAt = (deps.now ?? Date.now)();
  if (claims.iss !== 'https://access.line.me' || claims.aud !== config.channelId
    || typeof claims.sub !== 'string' || !LINE_USER_ID.test(claims.sub) || claims.nonce !== attempt.nonce
    || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= checkedAt / 1000
    || typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat > checkedAt / 1000 + 60) return fail('line_invalid_identity');
  const lineUserId = claims.sub;
  const userId = `line:${config.channelId}:${lineUserId}`;
  let displayName = (typeof claims.name === 'string' ? Array.from(claims.name.trim().replace(/[\u0000-\u001f\u007f]/g, '')).slice(0, 120).join('') : '') || 'ผู้ใช้ LINE';
  try { encodeURIComponent(displayName); } catch { displayName = 'ผู้ใช้ LINE'; }
  const email = typeof claims.email === 'string' && /^[\x21-\x7e]+$/.test(claims.email.trim())
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email.trim()) && claims.email.length <= 254 ? claims.email.trim().toLowerCase() : '';
  // Use the start of the friendship read as the freshness boundary. A follow/unfollow
  // event that happens during the HTTP request must win over this possibly older read.
  const friendshipCheckedAt = (deps.now ?? Date.now)();
  let friendStatus = 'unknown';
  try {
    const friendship = await lineFetch(fetcher, 'https://api.line.me/friendship/v1/status', {headers: {Authorization: `Bearer ${tokens.access_token}`}}, 'friendship');
    if (typeof friendship.friendFlag === 'boolean') friendStatus = friendship.friendFlag ? 'following' : 'not_following';
  } catch { /* Friendship is optional; a messaging setup issue must not block login. */ }
  const completedAt = (deps.now ?? Date.now)();
  const sessionToken = randomToken();
  const statements = [
    env.DB.prepare(`INSERT INTO hub_line_connections
      (user_id,line_user_id,login_channel_id,friend_status,friendship_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        friend_status=CASE WHEN excluded.friend_status='unknown' THEN hub_line_connections.friend_status ELSE excluded.friend_status END,
        friendship_checked_at=CASE WHEN excluded.friend_status='unknown' THEN hub_line_connections.friendship_checked_at ELSE excluded.friendship_checked_at END,
        updated_at=excluded.updated_at
      WHERE excluded.friendship_checked_at>hub_line_connections.friendship_checked_at
        OR (excluded.friendship_checked_at=hub_line_connections.friendship_checked_at
          AND (excluded.friend_status='not_following' OR hub_line_connections.friend_status<>'not_following'))`)
      .bind(userId, lineUserId, config.channelId, friendStatus, friendshipCheckedAt, completedAt, completedAt),
    env.DB.prepare('DELETE FROM hub_line_sessions WHERE expires_at<=?').bind(completedAt),
  ];
  const previousSession = cookie(request, SESSION_COOKIE);
  if (previousSession) statements.push(env.DB.prepare('DELETE FROM hub_line_sessions WHERE token_hash=?').bind(await hash(previousSession)));
  statements.push(env.DB.prepare(`INSERT INTO hub_line_sessions
    (token_hash,user_id,line_user_id,login_channel_id,origin,display_name,email,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(await hash(sessionToken), userId, lineUserId, config.channelId, config.origin, displayName, email, completedAt, completedAt + SESSION_MS));
  await authDatabase('persist_session', () => env.DB!.batch(statements));
  return redirect(attempt.return_to, [cookieValue(OAUTH_COOKIE, '', 0), cookieValue(SESSION_COOKIE, sessionToken, SESSION_MS / 1000)]);
  } catch (error) {
    logAuthFailure(error, 'callback');
    return fail('line_unavailable');
  }
}

async function logout(request: Request, env: LineEnvironment): Promise<Response> {
  if (request.method !== 'POST') return jsonError(405, 'method_not_allowed', 'กรุณากดออกจากระบบจากหน้าบัญชี', 'POST');
  const expected = appOrigin(env.APP_ORIGIN) ?? new URL(request.url).origin;
  if (new URL(request.url).origin !== expected || request.headers.get('origin') !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    return jsonError(403, 'invalid_origin', 'คำขอไม่ถูกต้อง กรุณารีเฟรชหน้าแล้วลองใหม่');
  }
  const token = cookie(request, SESSION_COOKIE);
  if (token && !env.DB) return jsonError(503, 'logout_unavailable', 'ยังออกจากระบบไม่ได้ กรุณาลองอีกครั้ง');
  if (token && env.DB) await env.DB.prepare('DELETE FROM hub_line_sessions WHERE token_hash=?').bind(await hash(token)).run();
  return redirect('/', [cookieValue(SESSION_COOKIE, '', 0), cookieValue(OAUTH_COOKIE, '', 0)]);
}

/** Run at Worker entry before framework routing. Returns null for unrelated paths. */
export async function handleLineAuthRequest(request: Request, env: LineEnvironment, deps: AuthDependencies = {}): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === '/auth/logout' || path === '/auth/line/logout') {
    try { return await logout(request, env); }
    catch { return jsonError(503, 'logout_unavailable', 'ยังออกจากระบบไม่ได้ กรุณาลองอีกครั้ง'); }
  }
  if (path !== '/auth/line/start' && path !== '/auth/line/callback') return null;
  if (request.method !== 'GET') return jsonError(405, 'method_not_allowed', 'วิธีเรียกใช้งานไม่ถูกต้อง', 'GET');
  const config = lineConfiguration(env);
  const requestedReturn = path === '/auth/line/start' ? new URL(request.url).searchParams.get('returnTo') ?? '/studio' : '/studio';
  if (!config) return authError('line_not_configured', true, requestedReturn);
  if (new URL(request.url).origin !== config.origin) return authError('line_origin_invalid', true, requestedReturn);
  try {
    return path === '/auth/line/start' ? await beginLogin(request, env, config, (deps.now ?? Date.now)())
      : await finishLogin(request, env, config, deps);
  } catch (error) {
    logAuthFailure(error, path === '/auth/line/start' ? 'begin_login' : 'callback');
    return authError('line_unavailable', true, requestedReturn);
  }
}


