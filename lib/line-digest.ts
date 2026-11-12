/** LINE report delivery. No browser-supplied destination is accepted by this module. */
export type LineDigestEnvironment = {
  DB?: D1Database;
  APP_ORIGIN?: string;
  LINE_LOGIN_CHANNEL_ID?: string;
  LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?: string;
  LINE_MESSAGING_CHANNEL_SECRET?: string;
  LINE_OFFICIAL_ACCOUNT_URL?: string;
  LINE_DIGEST_ENABLED?: string;
};
export class LineDigestError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'line_error') {
    super(message); this.status = status; this.code = code;
  }
}
export type LineSettings = {
  configured: boolean;
  connected: boolean;
  friendStatus: 'friend' | 'blocked' | 'unknown';
  enabled: boolean;
  time: string;
  timezone: 'Asia/Bangkok';
  officialAccountUrl: string | null;
  lastSentAt: number | null;
  lastStatus: string | null;
};
export type DigestReport = {
  text: string;
  reportDate: string;
  periodLabel: string;
  totals: {views: number; clicks: number};
  previous: {views: number; clicks: number};
  topLinks: Array<{title: string; pageTitle: string; clicks: number}>;
  busiestHour: number | null;
};
type Preference = {account_id: string; enabled: number; send_hour: number; send_minute: number; updated_at: number};
type Connection = {line_user_id: string; friend_status: string; user_id: string};
type Job = {
  id: string; account_id: string; line_user_id: string; report_date: string;
  kind: 'daily' | 'test'; payload_json: string; retry_key: string;
  status: string; attempts: number; created_at: number; first_attempt_at: number | null;
  next_attempt_at: number; lease_token: string | null;
};
type Fetcher = typeof fetch;
const DAY = 86_400_000;
const THAI_OFFSET = 7 * 3_600_000;
const RETRY_WINDOW = 23 * 3_600_000; // Leave margin before LINE's 24-hour deduplication expiry.
const LEASE = 120_000;
const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 100;

function database(env: LineDigestEnvironment): D1Database {
  if (!env.DB) throw new LineDigestError(503, 'ฐานข้อมูลยังไม่พร้อม กรุณาลองใหม่', 'database_unavailable');
  return env.DB;
}
export function appOrigin(env: LineDigestEnvironment): string | null {
  try {
    const url = new URL(env.APP_ORIGIN ?? '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' ? url.origin : null;
  } catch { return null; }
}
export function digestConfigured(env: LineDigestEnvironment): boolean {
  return env.LINE_DIGEST_ENABLED === 'true' && !!appOrigin(env)
    && /^\d+$/.test(env.LINE_LOGIN_CHANNEL_ID ?? '')
    && !!env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim()
    && !!env.LINE_MESSAGING_CHANNEL_SECRET?.trim();
}
function officialAccountUrl(value?: string): string | null {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && ['line.me', 'lin.ee'].includes(url.hostname)
      && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
export function bangkokDay(timestamp: number): {date: string; start: number; minutes: number} {
  const local = new Date(timestamp + THAI_OFFSET);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - THAI_OFFSET;
  return {date: new Date(start + THAI_OFFSET).toISOString().slice(0, 10), start, minutes: local.getUTCHours() * 60 + local.getUTCMinutes()};
}
export function reportWindow(now: number): {date: string; start: number; end: number; previousStart: number} {
  const end = bangkokDay(now).start;
  const start = end - DAY;
  return {date: bangkokDay(start).date, start, end, previousStart: start - DAY};
}
export function parseSendTime(value: unknown): {hour: number; minute: number} {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(value)) {
    throw new LineDigestError(400, 'เลือกเวลาเป็นช่วงละ 15 นาที เช่น 09:00 หรือ 20:30', 'invalid_time');
  }
  return {hour: Number(value.slice(0, 2)), minute: Number(value.slice(3))};
}
async function ensurePreference(db: D1Database, accountId: string, now: number): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO hub_line_preferences(account_id,enabled,send_hour,send_minute,updated_at) VALUES (?,0,9,0,?)').bind(accountId, now).run();
}
async function connectionFor(env: LineDigestEnvironment, accountId: string): Promise<Connection | null> {
  if (!env.LINE_LOGIN_CHANNEL_ID) return null;
  return database(env).prepare(`SELECT c.user_id,c.line_user_id,c.friend_status FROM hub_line_connections c
    JOIN hub_accounts a ON a.user_id=c.user_id WHERE a.id=? AND c.login_channel_id=?`)
    .bind(accountId, env.LINE_LOGIN_CHANNEL_ID).first<Connection>();
}
export async function getLineSettings(env: LineDigestEnvironment, accountId: string, now = Date.now()): Promise<LineSettings> {
  const db = database(env);
  await ensurePreference(db, accountId, now);
  const [preference, connection, latest, accepted] = await Promise.all([
    db.prepare('SELECT * FROM hub_line_preferences WHERE account_id=?').bind(accountId).first<Preference>(),
    connectionFor(env, accountId),
    db.prepare('SELECT status,last_error FROM hub_line_deliveries WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(accountId).first<{status: string; last_error: string | null}>(),
    db.prepare("SELECT MAX(accepted_at) AS sent_at FROM hub_line_deliveries WHERE account_id=? AND status='accepted'").bind(accountId).first<{sent_at: number | null}>(),
  ]);
  return {
    configured: digestConfigured(env), connected: !!connection,
    friendStatus: connection?.friend_status === 'following' ? 'friend' : connection?.friend_status === 'not_following' ? 'blocked' : 'unknown',
    enabled: !!preference?.enabled,
    time: `${String(preference?.send_hour ?? 9).padStart(2, '0')}:${String(preference?.send_minute ?? 0).padStart(2, '0')}`,
    timezone: 'Asia/Bangkok', officialAccountUrl: officialAccountUrl(env.LINE_OFFICIAL_ACCOUNT_URL),
    lastSentAt: accepted?.sent_at ?? null, lastStatus: latest?.status ?? null,
  };
}
function ensureCanSend(env: LineDigestEnvironment, connection: Connection | null): asserts connection is Connection {
  if (!digestConfigured(env)) throw new LineDigestError(503, 'ระบบส่งสรุป LINE ยังไม่พร้อม ผู้ดูแลต้องเชื่อมบัญชี LINE Official Account ก่อน', 'line_not_configured');
  if (!connection) throw new LineDigestError(409, 'เข้าสู่ระบบด้วย LINE เพื่อเชื่อมบัญชีรับสรุปของคุณ', 'line_not_connected');
  if (connection.friend_status !== 'following') throw new LineDigestError(409, 'เพิ่มเพื่อนบัญชี LINE ของนากนะ HUB แล้วเข้าสู่ระบบด้วย LINE อีกครั้ง', 'line_not_friend');
}
export async function updateLineSettings(env: LineDigestEnvironment, accountId: string, input: unknown, now = Date.now()): Promise<LineSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new LineDigestError(400, 'ข้อมูลไม่ถูกต้อง', 'invalid_settings');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['enabled', 'time'].includes(key)) || typeof value.enabled !== 'boolean') {
    throw new LineDigestError(400, 'เลือกเปิดหรือปิดสรุปและเวลาส่งให้ครบ', 'invalid_settings');
  }
  const time = parseSendTime(value.time);
  const db = database(env);
  if (value.enabled) ensureCanSend(env, await connectionFor(env, accountId));
  await db.prepare(`INSERT INTO hub_line_preferences(account_id,enabled,send_hour,send_minute,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(account_id) DO UPDATE SET enabled=excluded.enabled,send_hour=excluded.send_hour,send_minute=excluded.send_minute,updated_at=excluded.updated_at`)
    .bind(accountId, Number(value.enabled), time.hour, time.minute, now).run();
  if (!value.enabled) await db.prepare("UPDATE hub_line_deliveries SET status='cancelled',last_error='opted_out' WHERE account_id=? AND kind='daily' AND status IN ('pending','retry')").bind(accountId).run();
  return getLineSettings(env, accountId, now);
}
function safeLabel(value: unknown, max = 62): string {
  return (typeof value === 'string' ? value : '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function count(value: unknown): number { return Math.max(0, Number(value) || 0); }
export function differenceLabel(current: number, previous: number): string {
  const change = current - previous;
  if (!change) return 'เท่าเดิม';
  const base = `${change > 0 ? 'เพิ่ม' : 'ลด'} ${Math.abs(change).toLocaleString('th-TH')} ครั้ง`;
  if (!previous) return `${base} (วันก่อน 0 ครั้ง)`;
  return `${base} (${change > 0 ? '+' : '-'}${(Math.abs(change) / previous * 100).toFixed(1)}%)`;
}
export async function buildDigestReport(env: LineDigestEnvironment, accountId: string, now = Date.now()): Promise<DigestReport> {
  const db = database(env), period = reportWindow(now);
  const [totals, ranking, busiest] = await Promise.all([
    db.prepare(`SELECT
      SUM(CASE WHEN e.type='view' AND e.created_at>=? THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN e.type='click' AND e.created_at>=? THEN 1 ELSE 0 END) AS clicks,
      SUM(CASE WHEN e.type='view' AND e.created_at<? THEN 1 ELSE 0 END) AS previous_views,
      SUM(CASE WHEN e.type='click' AND e.created_at<? THEN 1 ELSE 0 END) AS previous_clicks
      FROM hub_events e JOIN hub_pages p ON p.id=e.page_id
      WHERE p.account_id=? AND e.created_at>=? AND e.created_at<?`)
      .bind(period.start, period.start, period.start, period.start, accountId, period.previousStart, period.end)
      .first<{views: number; clicks: number; previous_views: number; previous_clicks: number}>(),
    db.prepare(`SELECT COALESCE(NULLIF(l.title,''),'ลิงก์ที่เก็บเข้าคลัง') AS title,
      COALESCE(json_extract(p.profile_json,'$.name'),p.slug) AS page_title,COUNT(*) AS clicks
      FROM hub_events e JOIN hub_pages p ON p.id=e.page_id LEFT JOIN hub_links l ON l.id=e.link_id AND l.page_id=p.id
      WHERE p.account_id=? AND e.type='click' AND e.created_at>=? AND e.created_at<?
      GROUP BY e.page_id,e.link_id ORDER BY clicks DESC,e.page_id,e.link_id LIMIT 3`)
      .bind(accountId, period.start, period.end).all<{title: string; page_title: string; clicks: number}>(),
    db.prepare(`SELECT strftime('%H',e.created_at/1000,'unixepoch','+7 hours') AS hour,COUNT(*) AS clicks
      FROM hub_events e JOIN hub_pages p ON p.id=e.page_id
      WHERE p.account_id=? AND e.type='click' AND e.created_at>=? AND e.created_at<?
      GROUP BY hour ORDER BY clicks DESC,hour LIMIT 1`)
      .bind(accountId, period.start, period.end).first<{hour: string; clicks: number}>(),
  ]);
  const current = {views: count(totals?.views), clicks: count(totals?.clicks)};
  const previous = {views: count(totals?.previous_views), clicks: count(totals?.previous_clicks)};
  const topLinks = ranking.results.map(row => ({title: safeLabel(row.title), pageTitle: safeLabel(row.page_title, 38), clicks: count(row.clicks)}));
  const dateLabel = new Intl.DateTimeFormat('th-TH', {timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(period.start));
  const periodLabel = `${dateLabel} เวลา 00:00–23:59 น. (เวลาไทย)`;
  const lines = [
    `นากนะ HUB • สรุปประจำวัน`, periodLabel, '',
    `เข้าชม ${current.views.toLocaleString('th-TH')} ครั้ง`,
    `คลิกลิงก์ ${current.clicks.toLocaleString('th-TH')} ครั้ง`,
    `คลิกเทียบวันก่อน: ${differenceLabel(current.clicks, previous.clicks)}`, '',
  ];
  if (topLinks.length) {
    lines.push('ลิงก์ที่ถูกคลิกมากที่สุด');
    for (const [i, link] of topLinks.entries()) lines.push(`${i + 1}. ${link.title} — ${link.clicks.toLocaleString('th-TH')} ครั้ง`, `   ${link.pageTitle}`);
  } else lines.push('ในวันที่สรุปยังไม่มีคลิกที่บันทึกไว้');
  const busiestHour = busiest ? Number(busiest.hour) : null;
  if (busiestHour !== null) lines.push('', `ช่วงที่มีคลิกมากที่สุด ${String(busiestHour).padStart(2, '0')}:00–${String(busiestHour).padStart(2, '0')}:59 น.`);
  lines.push('', 'นับเป็นจำนวนครั้ง ไม่ใช่จำนวนคนไม่ซ้ำ');
  const origin = appOrigin(env);
  if (origin) lines.push(`เปิดสถิติและจัดการฮับ: ${origin}/studio`, `ตั้งค่าหรือปิดสรุป: ${origin}/studio?section=account`);
  return {text: lines.join('\n'), reportDate: period.date, periodLabel, totals: current, previous, topLinks, busiestHour};
}

async function enqueue(env: LineDigestEnvironment, accountId: string, connection: Connection, kind: 'daily' | 'test', now: number): Promise<string | null> {
  const report = await buildDigestReport(env, accountId, now);
  const id = crypto.randomUUID(), retryKey = crypto.randomUUID();
  const text = kind === 'test' ? `ข้อความทดสอบที่คุณขอ\n\n${report.text}` : report.text;
  const payload = JSON.stringify({to: connection.line_user_id, messages: [{type: 'text', text}]});
  const row = await database(env).prepare(`INSERT OR IGNORE INTO hub_line_deliveries
    (id,account_id,line_user_id,report_date,kind,payload_json,retry_key,status,attempts,created_at,next_attempt_at)
    VALUES (?,?,?,?,?,?,?,'pending',0,?,?) RETURNING id`)
    .bind(id, accountId, connection.line_user_id, report.reportDate, kind, payload, retryKey, now, now).first<{id: string}>();
  return row?.id ?? null;
}
export function classifyLineResponse(status: number, body: string, acceptedRequestId: string | null): {outcome: 'accepted' | 'retry' | 'failed'; code: string} {
  if (status >= 200 && status < 300) return {outcome: 'accepted', code: 'accepted'};
  if (status === 409 && acceptedRequestId) return {outcome: 'accepted', code: 'already_accepted'};
  if (status === 429) {
    return /monthly|quota|free messages|additional messages|maximum number of messages/i.test(body)
      ? {outcome: 'failed', code: 'quota_exceeded'} : {outcome: 'retry', code: 'rate_limited'};
  }
  return status >= 500 ? {outcome: 'retry', code: 'line_unavailable'} : {outcome: 'failed', code: `line_http_${status}`};
}
async function claimJob(db: D1Database, id: string, now: number): Promise<Job | null> {
  return db.prepare(`UPDATE hub_line_deliveries SET status='sending',lease_token=?,lease_until=?,attempts=attempts+1,
    first_attempt_at=COALESCE(first_attempt_at,?),last_attempt_at=?
    WHERE id=? AND attempts<? AND COALESCE(first_attempt_at,created_at)>?
    AND ((status IN ('pending','retry') AND next_attempt_at<=?) OR (status='sending' AND lease_until<?)) RETURNING *`)
    .bind(crypto.randomUUID(), now + LEASE, now, now, id, MAX_ATTEMPTS, now - RETRY_WINDOW, now, now).first<Job>();
}
async function sendJob(env: LineDigestEnvironment, id: string, now: number, fetcher: Fetcher, clock: () => number = Date.now): Promise<'accepted' | 'retry' | 'failed' | 'skipped'> {
  const db = database(env), job = await claimJob(db, id, now);
  if (!job) return 'skipped';
  const [connection, preference] = await Promise.all([
    connectionFor(env, job.account_id),
    db.prepare('SELECT enabled FROM hub_line_preferences WHERE account_id=?').bind(job.account_id).first<{enabled: number}>(),
  ]);
  if (!digestConfigured(env) || connection?.friend_status !== 'following' || connection.line_user_id !== job.line_user_id || (job.kind === 'daily' && !preference?.enabled)) {
    await db.prepare("UPDATE hub_line_deliveries SET status='cancelled',last_error='not_eligible',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?")
      .bind(job.id, job.lease_token).run();
    return 'skipped';
  }
  let result: {outcome: 'accepted' | 'retry' | 'failed'; code: string};
  let retryAfter = 0;
  try {
    const response = await fetcher('https://api.line.me/v2/bot/message/push', {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`, 'X-Line-Retry-Key': job.retry_key},
      // Workers supports manual, not error; classifyLineResponse rejects 3xx.
      // Never forward the bearer token or report payload to a redirect target.
      body: job.payload_json, signal: AbortSignal.timeout(12_000), redirect: 'manual',
    });
    const body = (await response.text()).slice(0, 1000);
    result = classifyLineResponse(response.status, body, response.headers.get('x-line-accepted-request-id'));
    retryAfter = Math.max(0, Math.min(7200, Number(response.headers.get('retry-after')) || 0)) * 1000;
  } catch { result = {outcome: 'retry', code: 'network_error'}; }
  const finishedAt = Math.max(now, clock());
  if (result.outcome === 'accepted') {
    await db.prepare("UPDATE hub_line_deliveries SET status='accepted',accepted_at=?,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?")
      .bind(finishedAt, job.id, job.lease_token).run();
    return 'accepted';
  }
  const delay = Math.max(retryAfter, Math.min(3_600_000, 15 * 60_000 * 2 ** Math.max(0, job.attempts - 1)));
  const canRetry = result.outcome === 'retry' && job.attempts < MAX_ATTEMPTS && finishedAt + delay < (job.first_attempt_at ?? now) + RETRY_WINDOW;
  await db.prepare('UPDATE hub_line_deliveries SET status=?,next_attempt_at=?,last_error=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?')
    .bind(canRetry ? 'retry' : 'failed', finishedAt + delay, canRetry ? result.code : job.attempts >= MAX_ATTEMPTS ? 'retry_exhausted' : result.code, job.id, job.lease_token).run();
  return canRetry ? 'retry' : 'failed';
}
export async function sendLineTest(env: LineDigestEnvironment, accountId: string, approvedReportDate: unknown, now = Date.now(), fetcher: Fetcher = fetch): Promise<{accepted: boolean; status: string; message: string}> {
  if (typeof approvedReportDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(approvedReportDate) || approvedReportDate !== reportWindow(now).date) {
    throw new LineDigestError(409, 'วันที่สรุปเปลี่ยนแล้ว กรุณาเปิดตัวอย่างล่าสุดและยืนยันส่งอีกครั้ง', 'preview_expired');
  }
  const connection = await connectionFor(env, accountId);
  ensureCanSend(env, connection);
  const db = database(env);
  await ensurePreference(db, accountId, now);
  const allowed = await db.prepare('UPDATE hub_line_preferences SET last_test_at=? WHERE account_id=? AND (last_test_at IS NULL OR last_test_at<=?) RETURNING account_id')
    .bind(now, accountId, now - 60_000).first();
  if (!allowed) throw new LineDigestError(429, 'ส่งข้อความทดสอบได้ครั้งละ 1 นาที กรุณารอสักครู่', 'test_rate_limited');
  const id = await enqueue(env, accountId, connection, 'test', now);
  if (!id) throw new LineDigestError(503, 'ยังเตรียมข้อความไม่ได้ กรุณาลองใหม่', 'queue_unavailable');
  const status = await sendJob(env, id, now, fetcher);
  return {
    accepted: status === 'accepted', status,
    message: status === 'accepted' ? 'LINE รับคำขอส่งข้อความแล้ว โปรดตรวจในแชตของคุณ' : status === 'retry' ? 'LINE ยังไม่รับข้อความ ระบบจะลองส่งอีกครั้งโดยป้องกันข้อความซ้ำ' : 'ยังส่งข้อความไม่ได้ กรุณาตรวจสถานะเพื่อนและการตั้งค่า LINE',
  };
}

/** Called only by the Worker's scheduled handler. Each tick is bounded; no public trigger endpoint exists. */
export async function runLineDigests(env: LineDigestEnvironment, scheduledTime = Date.now(), fetcher: Fetcher = fetch, clock: () => number = Date.now): Promise<{queued: number; accepted: number; retry: number; failed: number; skipped: number; disabled?: boolean}> {
  const result = {queued: 0, accepted: 0, retry: 0, failed: 0, skipped: 0};
  if (!digestConfigured(env) || !env.DB) return {...result, disabled: true};
  const db = env.DB, now = Math.max(scheduledTime, clock()), day = bangkokDay(now), reportDate = reportWindow(now).date;
  // Failed jobs never get a new retry key. An expired deduplication window is terminal.
  await db.prepare(`UPDATE hub_line_deliveries SET status='failed',last_error='retry_window_expired',lease_token=NULL,lease_until=NULL
    WHERE id IN (SELECT id FROM hub_line_deliveries WHERE status IN ('pending','retry','sending')
      AND (status<>'sending' OR lease_until<?)
      AND (COALESCE(first_attempt_at,created_at)<=? OR attempts>=?) LIMIT ?)`)
    .bind(now, now - RETRY_WINDOW, MAX_ATTEMPTS, BATCH_SIZE).run();
  const due = await db.prepare(`SELECT a.id AS account_id,c.user_id,c.line_user_id,c.friend_status FROM hub_line_preferences p
    JOIN hub_accounts a ON a.id=p.account_id JOIN hub_line_connections c ON c.user_id=a.user_id
    WHERE p.enabled=1 AND c.friend_status='following' AND c.login_channel_id=?
      AND p.send_hour*60+p.send_minute<=? AND p.updated_at<=?+(p.send_hour*60+p.send_minute)*60000
      AND NOT EXISTS(SELECT 1 FROM hub_line_deliveries d WHERE d.account_id=a.id AND d.report_date=? AND d.kind='daily')
    ORDER BY p.send_hour,p.send_minute,a.id LIMIT ?`)
    .bind(env.LINE_LOGIN_CHANNEL_ID, day.minutes, day.start, reportDate, BATCH_SIZE).all<Connection & {account_id: string}>();
  // Build immutable account-scoped messages before enqueueing. No analytics or recipient comes from the client.
  for (const row of due.results) {
    if (await enqueue(env, row.account_id, row, 'daily', now)) result.queued++;
  }
  const jobs = await db.prepare(`SELECT id FROM hub_line_deliveries WHERE
    (status IN ('pending','retry') AND next_attempt_at<=?) OR (status='sending' AND lease_until<?)
    ORDER BY next_attempt_at,created_at,id LIMIT ?`).bind(now, now, BATCH_SIZE).all<{id: string}>();
  // Five concurrent pushes, each atomically leased, with stable persisted LINE retry keys.
  for (let index = 0; index < jobs.results.length; index += 5) {
    const outcomes = await Promise.all(jobs.results.slice(index, index + 5).map(job => sendJob(env, job.id, Math.max(now, clock()), fetcher, clock)));
    for (const outcome of outcomes) result[outcome]++;
  }
  await db.prepare('DELETE FROM hub_line_webhook_receipts WHERE event_id IN (SELECT event_id FROM hub_line_webhook_receipts WHERE received_at<? LIMIT 1000)')
    .bind(now - 7 * DAY).run();
  return result;
}
