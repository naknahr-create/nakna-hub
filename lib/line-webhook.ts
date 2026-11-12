type WebhookEnvironment = {
  DB?: D1Database;
  LINE_MESSAGING_CHANNEL_SECRET?: string;
  LINE_LOGIN_CHANNEL_ID?: string;
};

export async function verifyLineWebhook(body: Uint8Array, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature) || !secret) return false;
  let decoded: Uint8Array;
  try { decoded = Uint8Array.from(atob(signature), char => char.charCodeAt(0)); } catch { return false; }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, new Uint8Array(decoded).buffer, new Uint8Array(body).buffer);
}
function response(value: unknown, status = 200): Response {
  return Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}
async function readRawBody(request: Request, max = 128 * 1024): Promise<Uint8Array | null> {
  if (Number(request.headers.get('content-length')) > max) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}

/** Raw bytes are authenticated before decoding JSON. Webhook never sends messages. */
export async function handleLineWebhook(request: Request, env: WebhookEnvironment, now = Date.now()): Promise<Response> {
  if (!env.LINE_MESSAGING_CHANNEL_SECRET || !/^\d+$/.test(env.LINE_LOGIN_CHANNEL_ID ?? '') || !env.DB) {
    return response({error: 'LINE webhook is not configured'}, 503);
  }
  const raw = await readRawBody(request);
  if (!raw) return response({error: 'Payload too large'}, 413);
  if (!await verifyLineWebhook(raw, request.headers.get('x-line-signature'), env.LINE_MESSAGING_CHANNEL_SECRET)) {
    return response({error: 'Invalid webhook signature'}, 401);
  }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(raw)); } catch { return response({error: 'Invalid JSON'}, 400); }
  if (!value || typeof value !== 'object' || !Array.isArray((value as {events?: unknown}).events)) {
    return response({error: 'Invalid webhook events'}, 400);
  }
  const events = (value as {events: unknown[]}).events;
  if (events.length > 100) return response({error: 'Too many events'}, 413);
  for (const item of events) {
    if (!item || typeof item !== 'object') continue;
    const event = item as {type?: unknown; webhookEventId?: unknown; timestamp?: unknown; source?: {type?: unknown; userId?: unknown}};
    if (!['follow', 'unfollow'].includes(String(event.type)) || event.source?.type !== 'user'
      || typeof event.source.userId !== 'string' || !/^U[0-9a-f]{32}$/.test(event.source.userId)
      || typeof event.webhookEventId !== 'string' || event.webhookEventId.length < 1 || event.webhookEventId.length > 128
      || typeof event.timestamp !== 'number' || !Number.isSafeInteger(event.timestamp) || event.timestamp < 0 || event.timestamp > now + 300_000) continue;
    const userId = `line:${env.LINE_LOGIN_CHANNEL_ID}:${event.source.userId}`;
    const friendStatus = event.type === 'follow' ? 'following' : 'not_following';
    // One transactional D1 batch: receipt + state can never partially commit. State timestamp
    // ordering makes duplicate/redelivered events harmless even after receipt retention expires.
    const statements = [
      env.DB.prepare(`INSERT INTO hub_line_connections(user_id,line_user_id,login_channel_id,friend_status,friendship_checked_at,created_at,updated_at)
        SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM hub_line_webhook_receipts WHERE event_id=?)
        ON CONFLICT(user_id) DO UPDATE SET friend_status=excluded.friend_status,friendship_checked_at=excluded.friendship_checked_at,updated_at=excluded.updated_at
        WHERE excluded.friendship_checked_at>hub_line_connections.friendship_checked_at
          OR (excluded.friendship_checked_at=hub_line_connections.friendship_checked_at AND excluded.friend_status='not_following')`)
        .bind(userId, event.source.userId, env.LINE_LOGIN_CHANNEL_ID, friendStatus, event.timestamp, now, now, event.webhookEventId),
      env.DB.prepare('INSERT OR IGNORE INTO hub_line_webhook_receipts(event_id,occurred_at,received_at) VALUES (?,?,?)').bind(event.webhookEventId, event.timestamp, now),
    ];
    if (friendStatus === 'not_following') {
      statements.push(env.DB.prepare(`UPDATE hub_line_deliveries SET status='cancelled',last_error='unfollowed'
        WHERE status IN ('pending','retry') AND line_user_id=? AND account_id IN
          (SELECT a.id FROM hub_accounts a JOIN hub_line_connections c ON c.user_id=a.user_id
           WHERE c.user_id=? AND c.friend_status='not_following')`).bind(event.source.userId, userId));
    }
    await env.DB.batch(statements);
  }
  return response({ok: true});
}
