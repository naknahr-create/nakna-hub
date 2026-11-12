import {env} from 'cloudflare:workers';
import {db, HubError, requireAccount, sameOrigin, type AccountRow} from './hub-data';
import {expireBillingEntitlement} from './hub-billing-entitlements';
import {HUB_BILLING_PRICES, HUB_BILLING_TERMS_VERSION, type BillingInterval, type BillingStatus} from './hub-billing-types';

// Pin the wire format: Basil places billing periods on subscription items.
const STRIPE_VERSION = '2025-08-27.basil';
const APP = 'nakna-hub';
const LEASE_MS = 90_000;
const encoder = new TextEncoder();
type ObjectValue = Record<string, unknown>;
type BillingEnvironment = {
  APP_ORIGIN?: string; STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string; STRIPE_PRICE_PRO_YEARLY?: string;
  STRIPE_BILLING_ENABLED?: string; STRIPE_PORTAL_CONFIGURATION_ID?: string;
};
type Configuration = {secret: string; webhookSecret: string; monthly: string; yearly: string;
  origin: string; portalConfiguration: string; mode: BillingStatus['mode']; ready: boolean; enabled: boolean};
type BillingRow = {account_id: string; stripe_customer_id: string | null; managed: number;
  lock_token: string | null; lock_until: number | null; checkout_request_key: string | null;
  checkout_payload_json: string | null; checkout_session_id: string | null;
  checkout_interval: BillingInterval | null; checkout_expires_at: number | null;
  last_synced_at: number | null; updated_at: number};
type SubscriptionRow = {stripe_subscription_id: string; account_id: string; stripe_customer_id: string;
  stripe_price_id: string; billing_interval: BillingInterval; status: string; current_period_end: number;
  paid_until: number; cancel_at_period_end: number; livemode: number; updated_at: number};
type Lease = {accountId: string; token: string; row: BillingRow};
type Receipt = {id: string; type: string; created: number};

function object(value: unknown): ObjectValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
}
function id(value: unknown, prefix: string): string {
  const candidate = typeof value === 'string' ? value : object(value).id;
  const pattern = prefix === 'cs' ? /^cs_(?:live_|test_)?[A-Za-z0-9]{1,220}$/ : new RegExp(`^${prefix}_[A-Za-z0-9]{1,220}$`);
  return typeof candidate === 'string' && pattern.test(candidate) ? candidate : '';
}
function timestamp(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value < 32_503_680_000 ? value * 1000 : 0;
}
function configuration(): Configuration {
  const settings = env as unknown as BillingEnvironment;
  const secret = settings.STRIPE_SECRET_KEY?.trim() ?? '';
  const webhookSecret = settings.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
  const monthly = settings.STRIPE_PRICE_PRO_MONTHLY?.trim() ?? '';
  const yearly = settings.STRIPE_PRICE_PRO_YEARLY?.trim() ?? '';
  const mode = /^(sk|rk)_live_[A-Za-z0-9]{12,}$/.test(secret) ? 'live'
    : /^(sk|rk)_test_[A-Za-z0-9]{12,}$/.test(secret) ? 'test' : 'unconfigured';
  let origin = '';
  try {const url = new URL(settings.APP_ORIGIN ?? ''); if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origin = url.origin;} catch { /* Fail closed. */ }
  const portalConfiguration = settings.STRIPE_PORTAL_CONFIGURATION_ID?.trim() ?? '';
  const ready = mode === 'live' && !!origin && /^whsec_[A-Za-z0-9]{16,}$/.test(webhookSecret)
    && !!id(monthly, 'price') && !!id(yearly, 'price') && monthly !== yearly
    && !!id(portalConfiguration, 'bpc');
  return {secret, webhookSecret, monthly, yearly, origin, portalConfiguration, mode, ready, enabled: settings.STRIPE_BILLING_ENABLED === 'true'};
}
function requireReady(config: Configuration, purchase = false): void {
  if (!config.ready || (purchase && !config.enabled)) throw new HubError(503,
    'ระบบชำระเงินยังไม่เปิดให้บริการ กรุณาลองใหม่ภายหลัง', {code: 'billing_unavailable'});
}
async function boundedBytes(request: Request, max: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length') ?? 0) > max) throw new HubError(413, 'ข้อมูลมีขนาดใหญ่เกินไป');
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = []; let length = 0;
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    length += value.length; if (length > max) {await reader.cancel(); throw new HubError(413, 'ข้อมูลมีขนาดใหญ่เกินไป');}
    parts.push(value);
  }
  const result = new Uint8Array(length); let offset = 0;
  for (const part of parts) {result.set(part, offset); offset += part.length;}
  return result;
}
async function input(request: Request): Promise<ObjectValue> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) throw new HubError(415, 'กรุณาส่งข้อมูลแบบ JSON');
  let value: unknown;
  try {value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await boundedBytes(request, 2048)));}
  catch (error) {if (error instanceof HubError) throw error; throw new HubError(400, 'ข้อมูลไม่ถูกต้อง');}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HubError(400, 'ข้อมูลไม่ถูกต้อง');
  return value as ObjectValue;
}
function noExtraFields(value: ObjectValue, fields: string[]): void {
  if (Object.keys(value).some(key => !fields.includes(key))) throw new HubError(400, 'มีข้อมูลที่ไม่รองรับ');
}
function hostedUrl(value: unknown, hostname: string): string {
  try {const url = new URL(typeof value === 'string' ? value : ''); if (url.protocol === 'https:' && url.hostname === hostname && !url.username && !url.password && !url.port) return url.href;} catch { /* Reject untrusted redirects. */ }
  throw new HubError(502, 'ยังเปิดหน้าชำระเงินไม่ได้ กรุณาลองอีกครั้ง');
}
async function stripe(config: Configuration, path: string, form?: URLSearchParams, key?: string): Promise<ObjectValue> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch('https://api.stripe.com/v1' + path, {
      method: form ? 'POST' : 'GET', redirect: 'manual', signal: controller.signal,
      headers: {'Authorization': 'Bearer ' + config.secret, 'Stripe-Version': STRIPE_VERSION,
        ...(form ? {'Content-Type': 'application/x-www-form-urlencoded'} : {}), ...(key ? {'Idempotency-Key': key} : {})},
      body: form?.toString(),
    });
    // Never follow a redirect carrying the server key or log provider payloads.
    if (!response.ok) {await response.body?.cancel(); throw new HubError(502, 'ติดต่อระบบชำระเงินไม่ได้ กรุณาลองอีกครั้ง', {code: 'billing_provider_error'});}
    if (Number(response.headers.get('content-length') ?? 0) > 2_000_000) {await response.body?.cancel(); throw new HubError(502, 'ข้อมูลจากระบบชำระเงินไม่สมบูรณ์');}
    const reader = response.body?.getReader(), parts: Uint8Array[] = []; let length = 0;
    if (!reader) throw new HubError(502, 'ข้อมูลจากระบบชำระเงินไม่สมบูรณ์');
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.length;
      if (length > 2_000_000) {await reader.cancel(); throw new HubError(502, 'ข้อมูลจากระบบชำระเงินไม่สมบูรณ์');}
      parts.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of parts) {bytes.set(part, offset); offset += part.length;}
    const parsed = object(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)));
    if (!Object.keys(parsed).length) throw new HubError(502, 'ข้อมูลจากระบบชำระเงินไม่สมบูรณ์');
    return parsed;
  } catch (error) {
    if (error instanceof HubError) throw error;
    throw new HubError(502, 'ติดต่อระบบชำระเงินไม่ได้ กรุณาลองอีกครั้ง', {code: 'billing_provider_error'});
  } finally {clearTimeout(timeout);}
}
async function acquire(accountId: string): Promise<Lease> {
  const now = Date.now(), token = crypto.randomUUID();
  await db().prepare('INSERT OR IGNORE INTO hub_billing_accounts (account_id,updated_at) VALUES (?,?)').bind(accountId, now).run();
  const update = await db().prepare(`UPDATE hub_billing_accounts SET lock_token=?,lock_until=?
    WHERE account_id=? AND (lock_until IS NULL OR lock_until<=?)`).bind(token, now + LEASE_MS, accountId, now).run();
  if (!update.meta.changes) throw new HubError(409, 'กำลังอัปเดตข้อมูลการชำระเงิน กรุณาลองอีกครั้งในสักครู่', {code: 'billing_busy'});
  const row = await db().prepare('SELECT * FROM hub_billing_accounts WHERE account_id=? AND lock_token=?').bind(accountId, token).first<BillingRow>();
  if (!row) throw new HubError(503, 'ยังอัปเดตข้อมูลการชำระเงินไม่ได้');
  return {accountId, token, row};
}
async function release(lease: Lease): Promise<void> {
  await db().prepare('UPDATE hub_billing_accounts SET lock_token=NULL,lock_until=NULL WHERE account_id=? AND lock_token=?').bind(lease.accountId, lease.token).run();
}
async function updateLease(lease: Lease, sql: string, values: (string | number | null)[]): Promise<void> {
  const result = await db().prepare(`UPDATE hub_billing_accounts SET ${sql} WHERE account_id=? AND lock_token=? AND lock_until>?`)
    .bind(...values, lease.accountId, lease.token, Date.now()).run();
  if (!result.meta.changes) throw new HubError(503, 'ข้อมูลการชำระเงินเปลี่ยนไปแล้ว กรุณาลองอีกครั้ง');
}
async function ensureCustomer(config: Configuration, lease: Lease): Promise<string> {
  if (lease.row.stripe_customer_id) return lease.row.stripe_customer_id;
  // A stable, minimal request means retries cannot change idempotency parameters.
  const customer = await stripe(config, '/customers', new URLSearchParams({
    'metadata[app]': APP, 'metadata[account_id]': lease.accountId,
  }), `hub-customer-v1-${lease.accountId}`);
  const customerId = id(customer, 'cus');
  if (!customerId || customer.livemode !== true) throw new HubError(502, 'ข้อมูลลูกค้าจากระบบชำระเงินไม่ถูกต้อง');
  await updateLease(lease, 'stripe_customer_id=?,updated_at=?', [customerId, Date.now()]);
  lease.row.stripe_customer_id = customerId;
  return customerId;
}
function expectedPrice(config: Configuration, interval: BillingInterval): string {return interval === 'month' ? config.monthly : config.yearly;}
function validPrice(price: ObjectValue, config: Configuration, interval: BillingInterval): boolean {
  const recurring = object(price.recurring);
  return price.id === expectedPrice(config, interval) && price.livemode === true && price.currency === 'thb'
    && price.unit_amount === (interval === 'month' ? 14900 : 149000)
    && recurring.interval === interval && recurring.interval_count === 1 && recurring.usage_type === 'licensed';
}
async function validatePortalConfiguration(config: Configuration): Promise<void> {
  const portal = await stripe(config, '/billing_portal/configurations/' + config.portalConfiguration);
  const features = object(portal.features), cancel = object(features.subscription_cancel);
  if (portal.id !== config.portalConfiguration || portal.active !== true || portal.livemode !== true
    || cancel.enabled !== true || cancel.mode !== 'at_period_end'
    || object(features.invoice_history).enabled !== true || object(features.payment_method_update).enabled !== true) {
    throw new HubError(503, 'ระบบจัดการสมาชิกยังไม่พร้อม กรุณาลองใหม่ภายหลัง', {code: 'billing_portal_not_ready'});
  }
}
async function allSubscriptions(config: Configuration, customer: string): Promise<ObjectValue[]> {
  const result: ObjectValue[] = []; let after = '';
  for (let page = 0; page < 5; page++) {
    const query = new URLSearchParams({customer, status: 'all', limit: '100'}); if (after) query.set('starting_after', after);
    const response = await stripe(config, '/subscriptions?' + query);
    if (!Array.isArray(response.data) || typeof response.has_more !== 'boolean') throw new HubError(502, 'ข้อมูลสมาชิกไม่สมบูรณ์');
    const rows = response.data.map(object); result.push(...rows);
    if (!response.has_more) return result;
    const next = id(rows.at(-1), 'sub'); if (!next || next === after) break; after = next;
  }
  throw new HubError(503, 'ยังตรวจสอบข้อมูลสมาชิกได้ไม่ครบ กรุณาติดต่อผู้ดูแล');
}
function matchesPaidLine(line: ObjectValue, subscriptionId: string, itemId: string, priceId: string, periodEnd: number): boolean {
  const parent = object(object(line.parent).subscription_item_details);
  const price = object(object(line.pricing).price_details);
  return (id(parent.subscription, 'sub') || id(line.subscription, 'sub')) === subscriptionId
    && (id(parent.subscription_item, 'si') || id(line.subscription_item, 'si')) === itemId
    && (id(price.price, 'price') || id(line.price, 'price')) === priceId
    && line.currency === 'thb' && line.quantity === 1 && typeof line.amount === 'number' && line.amount > 0
    && timestamp(object(line.period).end) >= periodEnd;
}
async function paidThrough(config: Configuration, subscription: ObjectValue, item: ObjectValue, periodEnd: number, customer: string): Promise<number> {
  const invoiceId = id(subscription.latest_invoice, 'in'); if (!invoiceId) return 0;
  const invoice = await stripe(config, '/invoices/' + invoiceId);
  const parent = object(object(invoice.parent).subscription_details);
  if (invoice.id !== invoiceId || invoice.livemode !== true || invoice.status !== 'paid' || invoice.currency !== 'thb'
    || id(invoice.customer, 'cus') !== customer || (id(parent.subscription, 'sub') || id(invoice.subscription, 'sub')) !== subscription.id) return 0;
  let lines = object(invoice.lines), after = '';
  for (let page = 0; page < 5; page++) {
    if (!Array.isArray(lines.data)) return 0;
    const rows = lines.data.map(object);
    if (rows.some(line => matchesPaidLine(line, String(subscription.id), String(item.id), String(object(item.price).id), periodEnd))) return periodEnd;
    if (!lines.has_more) return 0;
    const next = id(rows.at(-1), 'il'); if (!next || next === after) return 0; after = next;
    lines = await stripe(config, `/invoices/${invoiceId}/lines?limit=100&starting_after=${encodeURIComponent(after)}`);
  }
  return 0;
}
async function synchronize(config: Configuration, lease: Lease, receipt?: Receipt): Promise<ObjectValue[]> {
  const customer = lease.row.stripe_customer_id; if (!customer) return [];
  const subscriptions = await allSubscriptions(config, customer);
  const previous = await db().prepare('SELECT * FROM hub_billing_subscriptions WHERE account_id=?').bind(lease.accountId).all<SubscriptionRow>();
  const previousById = new Map(previous.results.map(row => [row.stripe_subscription_id, row]));
  const rows: SubscriptionRow[] = [], now = Date.now(); let recognized = false;
  for (const subscription of subscriptions) {
    const metadata = object(subscription.metadata);
    if (metadata.app !== APP || metadata.account_id !== lease.accountId) continue;
    recognized = true;
    const subscriptionId = id(subscription, 'sub'), items = object(subscription.items);
    if (!subscriptionId || subscription.livemode !== true || id(subscription.customer, 'cus') !== customer
      || !Array.isArray(items.data) || items.data.length !== 1 || items.has_more === true) continue;
    const item = object(items.data[0]), price = object(item.price);
    const interval: BillingInterval = price.id === config.yearly ? 'year' : 'month';
    const periodEnd = timestamp(item.current_period_end) || timestamp(subscription.current_period_end);
    let status = typeof subscription.status === 'string' ? subscription.status : 'invalid';
    let paidUntil = 0;
    if (!validPrice(price, config, interval) || item.quantity !== 1 || !id(item, 'si') || !periodEnd) status = 'invalid';
    if (status === 'active' || status === 'past_due') {
      paidUntil = Math.min(previousById.get(subscriptionId)?.paid_until ?? 0, periodEnd);
      if (status === 'active') paidUntil = Math.max(paidUntil, await paidThrough(config, subscription, item, periodEnd, customer));
    }
    const existingOwner = await db().prepare('SELECT account_id FROM hub_billing_subscriptions WHERE stripe_subscription_id=?').bind(subscriptionId).first<{account_id: string}>();
    if (existingOwner && existingOwner.account_id !== lease.accountId) throw new HubError(409, 'ข้อมูลสมาชิกไม่ตรงกับบัญชี');
    rows.push({stripe_subscription_id: subscriptionId, account_id: lease.accountId, stripe_customer_id: customer,
      stripe_price_id: typeof price.id === 'string' ? price.id : '', billing_interval: interval, status,
      current_period_end: periodEnd, paid_until: paidUntil, cancel_at_period_end: subscription.cancel_at_period_end === true ? 1 : 0,
      livemode: 1, updated_at: now});
  }
  const guard = 'EXISTS (SELECT 1 FROM hub_billing_accounts b WHERE b.account_id=? AND b.lock_token=? AND b.lock_until>?)';
  const guardValues = [lease.accountId, lease.token, Date.now()] as const;
  const statements = [db().prepare(`UPDATE hub_billing_subscriptions SET status='not_found',paid_until=0,updated_at=? WHERE account_id=? AND ${guard}`)
    .bind(now, lease.accountId, ...guardValues)];
  for (const row of rows) statements.push(db().prepare(`INSERT INTO hub_billing_subscriptions
    (stripe_subscription_id,account_id,stripe_customer_id,stripe_price_id,billing_interval,status,current_period_end,paid_until,cancel_at_period_end,livemode,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET stripe_price_id=excluded.stripe_price_id,billing_interval=excluded.billing_interval,
      status=excluded.status,current_period_end=excluded.current_period_end,paid_until=excluded.paid_until,
      cancel_at_period_end=excluded.cancel_at_period_end,livemode=excluded.livemode,updated_at=excluded.updated_at
      WHERE hub_billing_subscriptions.account_id=excluded.account_id`)
    .bind(row.stripe_subscription_id, row.account_id, row.stripe_customer_id, row.stripe_price_id, row.billing_interval, row.status,
      row.current_period_end, row.paid_until, row.cancel_at_period_end, row.livemode, now, ...guardValues));
  statements.push(db().prepare(`UPDATE hub_billing_accounts SET managed=MAX(managed,?) WHERE account_id=? AND ${guard}`)
    .bind(recognized ? 1 : 0, lease.accountId, ...guardValues));
  statements.push(db().prepare(`UPDATE hub_accounts SET plan=CASE WHEN EXISTS(SELECT 1 FROM hub_billing_subscriptions s
    WHERE s.account_id=hub_accounts.id AND s.livemode=1 AND s.status IN ('active','past_due') AND s.paid_until>?) THEN 'pro' ELSE 'starter' END,updated_at=?
    WHERE id=? AND EXISTS(SELECT 1 FROM hub_billing_accounts b WHERE b.account_id=hub_accounts.id AND b.managed=1) AND ${guard}`)
    .bind(now, now, lease.accountId, ...guardValues));
  if (receipt) statements.push(db().prepare(`INSERT OR IGNORE INTO hub_billing_webhook_events (stripe_event_id,event_type,account_id,created_at,received_at)
    SELECT ?,?,?,?,? WHERE ${guard}`).bind(receipt.id, receipt.type, lease.accountId, receipt.created, now, ...guardValues));
  statements.push(db().prepare(`UPDATE hub_billing_accounts SET last_synced_at=?,updated_at=? WHERE account_id=? AND lock_token=? AND lock_until>?`)
    .bind(now, now, ...guardValues));
  const results = await db().batch(statements);
  if (!results.at(-1)?.meta.changes) throw new HubError(503, 'ข้อมูลการชำระเงินเปลี่ยนไปแล้ว กรุณาลองอีกครั้ง');
  return subscriptions;
}
async function statusFor(account: AccountRow, config: Configuration): Promise<BillingStatus> {
  await expireBillingEntitlement(db(), account.id);
  const [billing, subscription, current] = await Promise.all([
    db().prepare('SELECT * FROM hub_billing_accounts WHERE account_id=?').bind(account.id).first<BillingRow>(),
    db().prepare(`SELECT * FROM hub_billing_subscriptions WHERE account_id=? ORDER BY CASE WHEN status IN ('active','past_due') THEN 0 ELSE 1 END,updated_at DESC,stripe_subscription_id DESC LIMIT 1`)
      .bind(account.id).first<SubscriptionRow>(),
    db().prepare('SELECT plan FROM hub_accounts WHERE id=?').bind(account.id).first<{plan: 'starter' | 'pro'}>(),
  ]);
  return {configured: config.ready && config.enabled, mode: config.mode,
    message: config.ready && config.enabled ? null : config.mode === 'test'
      ? 'ระบบชำระเงินอยู่ระหว่างทดสอบ ยังไม่เปิดรับชำระเงินจริง'
      : 'แพ็กเกจ Pro กำลังเตรียมเปิดให้สมัคร คุณยังใช้ Starter ฟรีได้ตามปกติ',
    plan: current?.plan ?? account.plan, canManage: config.ready && !!billing?.stripe_customer_id,
    subscription: subscription ? {status: subscription.status, interval: subscription.billing_interval,
      currentPeriodEnd: subscription.paid_until || subscription.current_period_end, cancelAtPeriodEnd: !!subscription.cancel_at_period_end} : null,
    prices: HUB_BILLING_PRICES, terms: {autoRenew: true, cancelAtPeriodEnd: true}};
}
export async function getBillingStatus(request: Request): Promise<BillingStatus> {
  return statusFor(await requireAccount(request), configuration());
}
export async function syncBilling(request: Request): Promise<BillingStatus> {
  const account = await requireAccount(request); sameOrigin(request); noExtraFields(await input(request), []);
  const config = configuration(); requireReady(config);
  const lease = await acquire(account.id);
  try {if (lease.row.stripe_customer_id && (!lease.row.last_synced_at || lease.row.last_synced_at < Date.now() - 5000)) await synchronize(config, lease);}
  finally {await release(lease);}
  return statusFor(account, config);
}
async function checkoutSession(config: Configuration, lease: Lease): Promise<ObjectValue | null> {
  if (lease.row.checkout_session_id) return stripe(config, '/checkout/sessions/' + lease.row.checkout_session_id);
  if (!lease.row.checkout_request_key || !lease.row.checkout_payload_json) return null;
  // After the intended expiry an unknown response cannot produce a payable
  // session. The caller has already checked current subscriptions before retry.
  if (lease.row.checkout_expires_at && lease.row.checkout_expires_at <= Date.now()) return null;
  let pairs: unknown;
  try {pairs = JSON.parse(lease.row.checkout_payload_json);} catch {throw new HubError(503, 'ข้อมูลรายการชำระเงินไม่สมบูรณ์');}
  if (!Array.isArray(pairs) || !pairs.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === 'string'))) throw new HubError(503, 'ข้อมูลรายการชำระเงินไม่สมบูรณ์');
  const session = await stripe(config, '/checkout/sessions', new URLSearchParams(pairs), lease.row.checkout_request_key);
  const sessionId = id(session, 'cs'); if (!sessionId) throw new HubError(502, 'ข้อมูลรายการชำระเงินไม่สมบูรณ์');
  await updateLease(lease, 'checkout_session_id=?,updated_at=?', [sessionId, Date.now()]);
  lease.row.checkout_session_id = sessionId;
  return session;
}
function validCheckout(session: ObjectValue, lease: Lease): boolean {
  return !!id(session, 'cs') && session.mode === 'subscription' && session.livemode === true
    && id(session.customer, 'cus') === lease.row.stripe_customer_id && session.client_reference_id === lease.accountId
    && object(session.metadata).app === APP && object(session.metadata).account_id === lease.accountId;
}
export async function createCheckout(request: Request): Promise<{url: string}> {
  const account = await requireAccount(request); sameOrigin(request);
  const data = await input(request); noExtraFields(data, ['interval']);
  if (data.interval !== 'month' && data.interval !== 'year') throw new HubError(400, 'กรุณาเลือกรอบชำระเงิน');
  const interval = data.interval, config = configuration(); requireReady(config, true);
  const lease = await acquire(account.id);
  try {
    const current = await db().prepare('SELECT plan FROM hub_accounts WHERE id=?').bind(account.id).first<{plan: string}>();
    if (current?.plan === 'pro') throw new HubError(409, 'บัญชีนี้ใช้ Pro อยู่แล้ว จัดการสมาชิกได้ในหน้าการชำระเงิน', {code: 'already_subscribed'});
    await validatePortalConfiguration(config);
    const customer = await ensureCustomer(config, lease);
    const subscriptions = await synchronize(config, lease);
    // Blocking incomplete and delinquent subscriptions also prevents a second bill.
    if (subscriptions.some(subscription => !['canceled', 'incomplete_expired'].includes(String(subscription.status))))
      throw new HubError(409, 'มีรายการสมาชิกอยู่แล้ว กรุณาจัดการรายการเดิมก่อน', {code: 'already_subscribed'});
    const price = await stripe(config, '/prices/' + expectedPrice(config, interval));
    if (!validPrice(price, config, interval) || price.active !== true) throw new HubError(503, 'ราคาสมาชิกยังไม่พร้อมให้ชำระเงิน', {code: 'billing_price_mismatch'});
    const existing = await checkoutSession(config, lease);
    if (existing) {
      if (!validCheckout(existing, lease)) throw new HubError(409, 'รายการชำระเงินไม่ตรงกับบัญชี');
      if (existing.status === 'complete') {
        const previousSubscription = id(existing.subscription, 'sub');
        const ended = subscriptions.some(subscription => subscription.id === previousSubscription
          && ['canceled', 'incomplete_expired'].includes(String(subscription.status)));
        if (!previousSubscription || !ended) throw new HubError(409, 'กำลังตรวจสอบผลชำระเงิน กรุณารีเฟรชสถานะสมาชิก', {code: 'checkout_processing'});
      } else if (existing.status === 'open') {
        if (timestamp(existing.expires_at) > Date.now() && lease.row.checkout_interval === interval) return {url: hostedUrl(existing.url, 'checkout.stripe.com')};
        const expired = await stripe(config, '/checkout/sessions/' + id(existing, 'cs') + '/expire', new URLSearchParams(), 'hub-expire-' + id(existing, 'cs'));
        if (expired.status !== 'expired') throw new HubError(409, 'ยังเปลี่ยนรอบชำระเงินไม่ได้ กรุณาลองอีกครั้ง');
      } else if (existing.status !== 'expired') throw new HubError(409, 'กรุณารอรายการชำระเงินเดิมสิ้นสุดก่อน');
    }
    // Leave a full hour so network latency cannot violate Stripe's 30-minute minimum.
    const expires = Math.floor(Date.now() / 1000) + 3600, key = 'hub-checkout-' + crypto.randomUUID();
    const form = new URLSearchParams({mode: 'subscription', customer, client_reference_id: account.id,
      'line_items[0][price]': expectedPrice(config, interval), 'line_items[0][quantity]': '1',
      'payment_method_types[0]': 'card', locale: 'th', expires_at: String(expires),
      success_url: config.origin + '/studio?billing=success', cancel_url: config.origin + '/studio?billing=cancelled',
      'metadata[app]': APP, 'metadata[account_id]': account.id, 'metadata[terms_version]': HUB_BILLING_TERMS_VERSION,
      'subscription_data[metadata][app]': APP, 'subscription_data[metadata][account_id]': account.id,
      'subscription_data[metadata][terms_version]': HUB_BILLING_TERMS_VERSION,
      'custom_text[submit][message]': 'สมาชิกต่ออายุอัตโนมัติ ยกเลิกการต่ออายุได้ในหน้าบัญชี และใช้ Pro ได้จนสิ้นสุดรอบที่ชำระแล้ว',
    });
    const payload = JSON.stringify(Array.from(form.entries()));
    await updateLease(lease, 'checkout_request_key=?,checkout_payload_json=?,checkout_session_id=NULL,checkout_interval=?,checkout_expires_at=?,updated_at=?',
      [key, payload, interval, expires * 1000, Date.now()]);
    Object.assign(lease.row, {checkout_request_key: key, checkout_payload_json: payload, checkout_session_id: null, checkout_interval: interval, checkout_expires_at: expires * 1000});
    const session = await checkoutSession(config, lease);
    if (!session || !validCheckout(session, lease) || session.status !== 'open') throw new HubError(502, 'ยังสร้างหน้าชำระเงินไม่ได้');
    return {url: hostedUrl(session.url, 'checkout.stripe.com')};
  } finally {await release(lease);}
}
export async function createBillingPortal(request: Request): Promise<{url: string}> {
  const account = await requireAccount(request); sameOrigin(request); noExtraFields(await input(request), []);
  const config = configuration(); requireReady(config);
  const billing = await db().prepare('SELECT stripe_customer_id FROM hub_billing_accounts WHERE account_id=?').bind(account.id).first<{stripe_customer_id: string | null}>();
  if (!billing?.stripe_customer_id) throw new HubError(409, 'ยังไม่มีข้อมูลสมาชิกที่ชำระเงิน');
  await validatePortalConfiguration(config);
  const form = new URLSearchParams({customer: billing.stripe_customer_id, return_url: config.origin + '/studio?billing=portal', locale: 'th'});
  if (config.portalConfiguration) form.set('configuration', config.portalConfiguration);
  const portal = await stripe(config, '/billing_portal/sessions', form);
  return {url: hostedUrl(portal.url, 'billing.stripe.com')};
}

/** Verify the exact bytes before parsing JSON, with Stripe's five-minute window. */
export async function verifyStripeSignature(bytes: Uint8Array, header: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!header || header.length > 4096 || !/^whsec_[A-Za-z0-9]{16,}$/.test(secret)) return false;
  const parts = header.split(',').map(part => part.trim().split('='));
  const timestamps = parts.filter(part => part[0] === 't').map(part => part[1]);
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamps[0])) return false;
  const time = Number(timestamps[0]); if (Math.abs(now / 1000 - time) > 300) return false;
  const signatures = parts.filter(part => part[0] === 'v1' && /^[a-f0-9]{64}$/i.test(part[1] ?? '')).map(part => part[1]);
  if (!signatures.length || signatures.length > 8) return false;
  const prefix = encoder.encode(timestamps[0] + '.'), signed = new Uint8Array(prefix.length + bytes.length);
  signed.set(prefix); signed.set(bytes, prefix.length);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const actual = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));
  let match = 0;
  for (const signature of signatures) {
    let difference = 0;
    for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ parseInt(signature.slice(i * 2, i * 2 + 2), 16);
    match |= difference === 0 ? 1 : 0;
  }
  return match === 1;
}
const WEBHOOK_TYPES = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required']);
export async function receiveStripeWebhook(request: Request): Promise<{received: true; duplicate?: boolean; ignored?: boolean}> {
  const config = configuration(); requireReady(config);
  const bytes = await boundedBytes(request, 512_000);
  if (!await verifyStripeSignature(bytes, request.headers.get('stripe-signature'), config.webhookSecret)) throw new HubError(400, 'ลายเซ็นการชำระเงินไม่ถูกต้อง');
  let event: ObjectValue;
  try {event = object(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)));} catch {throw new HubError(400, 'ข้อมูลการชำระเงินไม่ถูกต้อง');}
  const eventId = id(event, 'evt');
  if (!eventId || typeof event.type !== 'string' || !timestamp(event.created)) throw new HubError(400, 'ข้อมูลการชำระเงินไม่ถูกต้อง');
  if (event.livemode !== true || !WEBHOOK_TYPES.has(event.type)) return {received: true, ignored: true};
  if (await db().prepare('SELECT stripe_event_id FROM hub_billing_webhook_events WHERE stripe_event_id=?').bind(eventId).first()) return {received: true, duplicate: true};
  const payload = object(object(event.data).object), customer = id(payload.customer, 'cus');
  if (!customer) return {received: true, ignored: true};
  const billing = await db().prepare('SELECT * FROM hub_billing_accounts WHERE stripe_customer_id=?').bind(customer).first<BillingRow>();
  if (!billing) return {received: true, ignored: true};
  let lease: Lease;
  try {lease = await acquire(billing.account_id);} catch (error) {
    if (error instanceof HubError && error.status === 409) throw new HubError(503, 'กำลังประมวลผลรายการ กรุณาส่งเหตุการณ์ซ้ำ');
    throw error;
  }
  try {
    if (await db().prepare('SELECT stripe_event_id FROM hub_billing_webhook_events WHERE stripe_event_id=?').bind(eventId).first()) return {received: true, duplicate: true};
    // Event timestamps are not ordering guarantees. Re-read current Stripe state
    // while holding the same account lease used by checkout and manual sync.
    await synchronize(config, lease, {id: eventId, type: event.type, created: timestamp(event.created)});
    return {received: true};
  } finally {await release(lease);}
}
