import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createHash, createHmac, randomBytes} from 'node:crypto';
import ts from 'typescript';

// Real billing code, authentication, SQL transactions and migrations. Only the
// provider transport and the Workers database binding are substituted.
const root = new URL('../', import.meta.url), testEnv = {}, databases = [];
const environmentKey = Symbol.for('nakna-hub.billing.environment');
globalThis[environmentKey] = testEnv;
const originalFetch = globalThis.fetch;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {url: 'data:text/javascript,export const env=globalThis[Symbol.for("nakna-hub.billing.environment")];', shortCircuit: true};
    const candidate = specifier.startsWith('@/') ? new URL(specifier.slice(2), root)
      : specifier.startsWith('.') && context.parentURL?.startsWith(root.href) ? new URL(specifier, context.parentURL) : null;
    if (candidate) {const file = candidate.pathname.endsWith('.ts') ? candidate : new URL(candidate.href + '.ts'); if (existsSync(file)) return {url: file.href, shortCircuit: true};}
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(root.href) && url.endsWith('.ts')) return {format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText};
    return nextLoad(url, context);
  },
});
const {authenticateHubRequest} = await import('../lib/hub-auth.ts');
const {getBillingStatus, createCheckout, createBillingPortal, syncBilling, receiveStripeWebhook, verifyStripeSignature} = await import('../lib/hub-billing.ts');
const {expireBillingEntitlement} = await import('../lib/hub-billing-entitlements.ts');
const {updatePage, createPage, createLink, publishPage, getPublicHub, requireAccount} = await import('../lib/hub-data.ts');
const ORIGIN = 'https://hub.example.com', CHANNEL = '1234567890';
const COOKIE_A = 'a'.repeat(43), COOKIE_B = 'b'.repeat(43);
const USER_A = `line:${CHANNEL}:U${'a'.repeat(32)}`, USER_B = `line:${CHANNEL}:U${'b'.repeat(32)}`;
// Ephemeral test-only credentials. Nothing credential-shaped is committed, and
// the mocked transport below never sends these values to Stripe or the network.
const WEBHOOK_SECRET = 'whsec_' + randomBytes(32).toString('hex');
function stripeFixtureKey(mode = 'live') {return `sk_${mode}_${randomBytes(24).toString('hex')}`;}
after(() => {hooks.deregister(); globalThis.fetch = originalFetch; delete globalThis[environmentKey]; for (const database of databases) database.close();});
function sqlite() {
  const sql = new DatabaseSync(':memory:'); databases.push(sql); sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('drizzle/', root)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) sql.exec(readFileSync(new URL('drizzle/' + file, root), 'utf8'));
  const statement = (query, values = []) => ({query, values, bind(...args) {return statement(query, args);},
    async first(column) {const row = sql.prepare(query).get(...values); return row ? column ? row[column] : {...row} : null;},
    async all() {return {results: sql.prepare(query).all(...values).map(row => ({...row})), success: true};},
    async run() {return this.execute();}, execute() {const result = sql.prepare(query).run(...values); return {success: true, meta: {changes: Number(result.changes)}};},
  });
  return {sql, prepare: statement, async batch(statements) {sql.exec('BEGIN'); try {const result = statements.map(s => s.execute()); sql.exec('COMMIT'); return result;} catch (error) {sql.exec('ROLLBACK'); throw error;}}};
}
function price(interval = 'month') {return {id: interval === 'month' ? 'price_monthly' : 'price_yearly', object: 'price', livemode: true, active: true,
  currency: 'thb', unit_amount: interval === 'month' ? 14900 : 149000, recurring: {interval, interval_count: 1, usage_type: 'licensed'}};}
function setup() {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  Object.assign(testEnv, {DB: sqlite(), APP_ORIGIN: ORIGIN, LINE_LOGIN_CHANNEL_ID: CHANNEL, LINE_LOGIN_CHANNEL_SECRET: 'TEST_BILLING_SECRET',
    STRIPE_SECRET_KEY: stripeFixtureKey(), STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRICE_PRO_MONTHLY: 'price_monthly', STRIPE_PRICE_PRO_YEARLY: 'price_yearly', STRIPE_BILLING_ENABLED: 'true', STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_config1'});
  const now = Date.now();
  for (const [user, token] of [[USER_A, COOKIE_A], [USER_B, COOKIE_B]]) testEnv.DB.sql.prepare(`INSERT INTO hub_line_sessions
    (token_hash,user_id,line_user_id,login_channel_id,origin,display_name,email,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(createHash('sha256').update(token).digest('hex'), user, user.split(':')[2], CHANNEL, ORIGIN, user === USER_A ? 'Owner A' : 'Owner B', '', now, now + 600000);
  const state = {customers: new Map(), sessions: new Map(), idempotency: new Map(), subscriptions: [], invoices: new Map(), requests: [],
    failCheckoutAfterCreate: false, priceOverride: null, redirect: false, portalCustomer: null, portalMode: 'at_period_end', holdCheckout: null};
  globalThis.fetch = async (value, options = {}) => {
    const url = new URL(value); assert.equal(url.origin, 'https://api.stripe.com'); assert.equal(options.redirect, 'manual');
    const headers = new Headers(options.headers); assert.equal(headers.get('Authorization'), 'Bearer ' + testEnv.STRIPE_SECRET_KEY);
    assert.equal(headers.has('Cookie'), false); assert.equal(headers.get('Stripe-Version'), '2025-08-27.basil');
    const method = options.method ?? 'GET', form = new URLSearchParams(options.body), key = headers.get('Idempotency-Key');
    const request = {path: url.pathname, query: url.searchParams, method, form, key}; state.requests.push(request);
    if (state.redirect) return new Response(null, {status: 302, headers: {Location: 'https://bad.example/secret'}});
    if (method === 'POST' && key && state.idempotency.has(key)) return Response.json(state.idempotency.get(key));
    let result;
    if (url.pathname === '/v1/billing_portal/configurations/bpc_config1') {
      result = {id: 'bpc_config1', active: true, livemode: true, features: {subscription_cancel: {enabled: true, mode: state.portalMode},
        invoice_history: {enabled: true}, payment_method_update: {enabled: true}}};
    } else if (url.pathname === '/v1/customers' && method === 'POST') {
      result = {id: 'cus_customer' + (state.customers.size + 1), livemode: true, metadata: {app: form.get('metadata[app]'), account_id: form.get('metadata[account_id]')}};
      state.customers.set(result.id, result);
    } else if (url.pathname === '/v1/subscriptions') {
      result = {data: state.subscriptions.filter(s => s.customer === url.searchParams.get('customer')), has_more: false};
    } else if (url.pathname.startsWith('/v1/prices/')) {
      result = state.priceOverride ?? price(url.pathname.endsWith('price_yearly') ? 'year' : 'month');
    } else if (url.pathname === '/v1/checkout/sessions' && method === 'POST') {
      result = {id: 'cs_live_session' + (state.sessions.size + 1), mode: form.get('mode'), livemode: true, customer: form.get('customer'),
        client_reference_id: form.get('client_reference_id'), metadata: {app: form.get('metadata[app]'), account_id: form.get('metadata[account_id]')},
        status: 'open', expires_at: Number(form.get('expires_at')), subscription: null};
      result.url = 'https://checkout.stripe.com/c/pay/' + result.id; state.sessions.set(result.id, result);
    } else if (url.pathname.startsWith('/v1/checkout/sessions/')) {
      const sessionId = url.pathname.split('/')[4], session = state.sessions.get(sessionId); assert.ok(session, 'Known checkout session');
      if (url.pathname.endsWith('/expire')) session.status = 'expired'; result = {...session};
    } else if (url.pathname.startsWith('/v1/invoices/')) {
      result = state.invoices.get(url.pathname.split('/')[3]); assert.ok(result, 'Known invoice');
    } else if (url.pathname === '/v1/billing_portal/sessions') {
      state.portalCustomer = form.get('customer'); result = {url: 'https://billing.stripe.com/p/session/fixture'};
    } else assert.fail('Unexpected Stripe request ' + method + ' ' + url.pathname);
    if (method === 'POST' && key) state.idempotency.set(key, result);
    if (url.pathname === '/v1/checkout/sessions' && state.holdCheckout) {state.holdCheckout.entered(); await state.holdCheckout.release;}
    if (url.pathname === '/v1/checkout/sessions' && state.failCheckoutAfterCreate) {state.failCheckoutAfterCreate = false; throw new Error('simulated uncertain network result');}
    return Response.json(result);
  };
  return {state, sql: testEnv.DB.sql};
}
async function request(path, {actor = 'a', method = 'GET', body, headers = {}} = {}) {
  // These existing fixtures model a freshly loaded client. Missing and stale
  // revisions are tested explicitly in hub-teams.test.mjs instead of auto-filled.
  const url = new URL(path, ORIGIN);
  const pageMatch = /^\/api\/pages\/([0-9a-f-]+)(?:\/(?:links(?:\/[0-9a-f-]+)?|reorder|publish|unpublish))?$/.exec(url.pathname);
  if (pageMatch && ['POST', 'PATCH', 'DELETE'].includes(method)) {
    const row = testEnv.DB.sql.prepare('SELECT revision FROM hub_pages WHERE id=?').get(pageMatch[1]);
    if (row && method === 'DELETE' && !url.searchParams.has('revision')) url.searchParams.set('revision', String(row.revision));
    else if (row && method !== 'DELETE') body = {revision: row.revision, ...body};
    path = url.pathname + url.search;
  }
  const token = actor === 'a' ? COOKIE_A : actor === 'b' ? COOKIE_B : '';
  return authenticateHubRequest(new Request(ORIGIN + path, {method, headers: {
    ...(token ? {Cookie: '__Host-nakna_session=' + token} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
    ...(method !== 'GET' ? {Origin: ORIGIN} : {}), ...headers,
  }, body: body === undefined ? undefined : JSON.stringify(body)}), testEnv);
}
async function checkout(interval = 'month', actor = 'a') {return createCheckout(await request('/api/billing/checkout', {actor, method: 'POST', body: {interval}}));}
async function account(actor = 'a') {await getBillingStatus(await request('/api/billing', {actor})); return testEnv.DB.sql.prepare('SELECT * FROM hub_accounts WHERE user_id=?').get(actor === 'a' ? USER_A : USER_B);}
function paidSubscription(state, owner, interval = 'month', suffix = 'A') {
  const customer = [...state.customers.values()].find(c => c.metadata.account_id === owner.id); assert.ok(customer);
  const periodEnd = Math.floor(Date.now() / 1000) + (interval === 'month' ? 30 : 365) * 86400;
  const subscription = {id: 'sub_subscription' + suffix, object: 'subscription', livemode: true, status: 'active', customer: customer.id,
    metadata: {app: 'nakna-hub', account_id: owner.id}, cancel_at_period_end: false, latest_invoice: 'in_invoice' + suffix,
    items: {data: [{id: 'si_item' + suffix, quantity: 1, current_period_end: periodEnd, price: price(interval)}], has_more: false}};
  const invoice = {id: subscription.latest_invoice, object: 'invoice', livemode: true, status: 'paid', currency: 'thb', customer: customer.id,
    parent: {subscription_details: {subscription: subscription.id}}, lines: {data: [{id: 'il_line' + suffix, quantity: 1, amount: interval === 'month' ? 14900 : 149000,
      currency: 'thb', period: {end: periodEnd}, pricing: {price_details: {price: price(interval).id}},
      parent: {type: 'subscription_item_details', subscription_item_details: {subscription: subscription.id, subscription_item: 'si_item' + suffix}}}], has_more: false}};
  state.subscriptions.push(subscription); state.invoices.set(invoice.id, invoice);
  return {subscription, invoice, periodEnd};
}
function signedEvent(customer, {eventId = 'evt_eventA', type = 'invoice.paid', livemode = true, created = Math.floor(Date.now() / 1000)} = {}) {
  const payload = JSON.stringify({id: eventId, type, livemode, created, data: {object: {customer}}});
  const time = Math.floor(Date.now() / 1000), signature = createHmac('sha256', WEBHOOK_SECRET).update(`${time}.${payload}`).digest('hex');
  return new Request(ORIGIN + '/api/billing/webhook', {method: 'POST', headers: {'Stripe-Signature': `t=${time},v1=${signature}`, 'Content-Type': 'application/json'}, body: payload});
}

test('billing availability fails closed without live credentials and never exposes keys', async () => {
  const {state} = setup(); delete testEnv.STRIPE_SECRET_KEY;
  const status = await getBillingStatus(await request('/api/billing'));
  assert.equal(status.configured, false); assert.equal(status.mode, 'unconfigured'); assert.equal(status.plan, 'starter');
  assert.deepEqual(status.prices, {monthly: 149, yearly: 1490, currency: 'THB'});
  assert.equal(JSON.stringify(status).includes('whsec_'), false);
  await assert.rejects(checkout(), error => error.status === 503); assert.equal(state.requests.length, 0);
  testEnv.STRIPE_SECRET_KEY = stripeFixtureKey('test');
  assert.equal((await getBillingStatus(await request('/api/billing'))).mode, 'test');
  await assert.rejects(checkout(), error => error.status === 503);
});

test('checkout validates authentication, same origin, server prices and body allowlist', async () => {
  const {state} = setup();
  await assert.rejects(checkout('month', null), error => error.status === 401);
  await assert.rejects(createCheckout(await request('/api/billing/checkout', {method: 'POST', body: {interval: 'month'}, headers: {Origin: 'https://evil.example'}})), error => error.status === 403);
  await assert.rejects(createCheckout(await request('/api/billing/checkout', {method: 'POST', body: {interval: 'month', price: 'price_cheaper'}})), error => error.status === 400);
  await assert.rejects(checkout('week'), error => error.status === 400);
  assert.equal(state.requests.length, 0);
  state.priceOverride = {...price(), unit_amount: 1};
  await assert.rejects(checkout(), error => error.extra.code === 'billing_price_mismatch'); assert.equal(state.sessions.size, 0);
});

test('checkout creates correct monthly/annual card-only subscriptions and reuses an open session', async () => {
  const {state} = setup(); const first = await checkout(); const again = await checkout(); assert.equal(first.url, again.url);
  assert.equal(state.sessions.size, 1); assert.equal(state.customers.size, 1);
  const create = state.requests.find(r => r.path === '/v1/checkout/sessions' && r.method === 'POST');
  assert.equal(create.form.get('line_items[0][price]'), 'price_monthly'); assert.equal(create.form.get('line_items[0][quantity]'), '1');
  assert.equal(create.form.get('payment_method_types[0]'), 'card'); assert.equal(create.form.has('subscription_data[trial_period_days]'), false);
  assert.equal(create.form.get('subscription_data[metadata][terms_version]'), '2026-11-13-pro-analytics');
  assert.equal(create.form.get('success_url'), ORIGIN + '/studio?billing=success');
  const annual = await checkout('year'); assert.notEqual(annual.url, first.url); assert.equal(state.sessions.size, 2);
  assert.equal([...state.sessions.values()][0].status, 'expired');
  const annualCreate = state.requests.filter(r => r.path === '/v1/checkout/sessions' && r.method === 'POST').at(-1);
  assert.equal(annualCreate.form.get('line_items[0][price]'), 'price_yearly');
});

test('an uncertain Checkout response retries the persisted idempotency request, not a new charge', async () => {
  const {state, sql} = setup(); state.failCheckoutAfterCreate = true;
  await assert.rejects(checkout(), error => error.status === 502); assert.equal(state.sessions.size, 1);
  assert.equal(sql.prepare('SELECT checkout_session_id FROM hub_billing_accounts').get().checkout_session_id, null);
  await checkout(); assert.equal(state.sessions.size, 1);
  const creates = state.requests.filter(r => r.path === '/v1/checkout/sessions' && r.method === 'POST');
  assert.equal(creates[0].key, creates[1].key); assert.equal(creates[0].form.toString(), creates[1].form.toString());
});

test('concurrent checkout cannot create two sessions for the same account', async () => {
  const {state} = setup(); let entered, release;
  const reachedProvider = new Promise(resolve => {entered = resolve;});
  state.holdCheckout = {entered: () => entered(), release: new Promise(resolve => {release = resolve;})};
  const first = checkout(); await reachedProvider;
  try {await assert.rejects(checkout(), error => error.status === 409);}
  finally {release();}
  await first; assert.equal(state.sessions.size, 1);
});

test('past_due, unpaid, paused, trialing and incomplete subscriptions block duplicate purchases', async () => {
  for (const status of ['past_due', 'unpaid', 'paused', 'trialing', 'incomplete']) {
    const {state} = setup(); await checkout(); const owner = await account(); const {subscription} = paidSubscription(state, owner);
    subscription.status = status;
    await assert.rejects(checkout(), error => error.extra.code === 'already_subscribed'); assert.equal(state.sessions.size, 1, status);
  }
});

test('Stripe signatures authenticate exact raw bytes and reject expired/future timestamps', async () => {
  setup(); const now = Date.now(), time = Math.floor(now / 1000), bytes = new TextEncoder().encode('{"value":1}');
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${time}.`).update(bytes).digest('hex');
  assert.equal(await verifyStripeSignature(bytes, `t=${time},v0=ignored,v1=${'0'.repeat(64)},v1=${sig}`, WEBHOOK_SECRET, now), true);
  assert.equal(await verifyStripeSignature(new TextEncoder().encode('{"value":2}'), `t=${time},v1=${sig}`, WEBHOOK_SECRET, now), false);
  assert.equal(await verifyStripeSignature(bytes, `t=${time},v1=${sig}`, WEBHOOK_SECRET, now + 301000), false);
  assert.equal(await verifyStripeSignature(bytes, `t=${time},v1=${sig}`, WEBHOOK_SECRET, now - 301000), false);
  assert.equal(await verifyStripeSignature(bytes, `t=${time},t=${time},v1=${sig}`, WEBHOOK_SECRET, now), false);
});

test('signed paid invoice grants only its owning account and duplicate delivery performs no extra provider work', async () => {
  const {state, sql} = setup(); await checkout(); const owner = await account(), other = await account('b');
  const {subscription, periodEnd} = paidSubscription(state, owner);
  assert.deepEqual(await receiveStripeWebhook(signedEvent(subscription.customer)), {received: true});
  assert.equal(sql.prepare('SELECT plan FROM hub_accounts WHERE id=?').get(owner.id).plan, 'pro');
  assert.equal(sql.prepare('SELECT plan FROM hub_accounts WHERE id=?').get(other.id).plan, 'starter');
  assert.equal(sql.prepare('SELECT paid_until FROM hub_billing_subscriptions').get().paid_until, periodEnd * 1000);
  const count = state.requests.length;
  assert.deepEqual(await receiveStripeWebhook(signedEvent(subscription.customer)), {received: true, duplicate: true}); assert.equal(state.requests.length, count);
});

test('test-mode and invalidly signed events never change live entitlements', async () => {
  const {state, sql} = setup(); await checkout(); const owner = await account(); const {subscription} = paidSubscription(state, owner);
  assert.deepEqual(await receiveStripeWebhook(signedEvent(subscription.customer, {livemode: false})), {received: true, ignored: true});
  const invalid = signedEvent(subscription.customer); invalid.headers.set('Stripe-Signature', 't=1,v1=' + '0'.repeat(64));
  await assert.rejects(receiveStripeWebhook(invalid), error => error.status === 400);
  assert.equal(sql.prepare('SELECT plan FROM hub_accounts WHERE id=?').get(owner.id).plan, 'starter');
  assert.equal(sql.prepare('SELECT count(*) AS n FROM hub_billing_webhook_events').get().n, 0);
});

test('active alone, unpaid invoices, stale periods and foreign invoice bindings cannot unlock Pro', async () => {
  for (const mutation of [
    ({invoice}) => {invoice.status = 'open';},
    ({invoice}) => {invoice.status = 'uncollectible';},
    ({invoice}) => {invoice.customer = 'cus_foreign';},
    ({invoice}) => {invoice.lines.data[0].period.end -= 32 * 86400;},
    ({invoice}) => {invoice.lines.data[0].parent.subscription_item_details.subscription_item = 'si_foreign';},
    ({subscription}) => {subscription.items.data[0].price.currency = 'usd';},
    ({subscription}) => {subscription.items.data[0].price.unit_amount = 1;},
  ]) {
    const {state, sql} = setup(); await checkout(); const owner = await account(); const fixtures = paidSubscription(state, owner); mutation(fixtures);
    await receiveStripeWebhook(signedEvent(fixtures.subscription.customer));
    assert.equal(sql.prepare('SELECT plan FROM hub_accounts WHERE id=?').get(owner.id).plan, 'starter');
  }
});

test('out-of-order signed events re-read current state and cannot revive a canceled subscription', async () => {
  const {state, sql} = setup(); await checkout(); const owner = await account(); const {subscription} = paidSubscription(state, owner);
  await receiveStripeWebhook(signedEvent(subscription.customer)); subscription.status = 'canceled';
  await receiveStripeWebhook(signedEvent(subscription.customer, {eventId: 'evt_cancel', type: 'customer.subscription.deleted'}));
  await receiveStripeWebhook(signedEvent(subscription.customer, {eventId: 'evt_oldpaid', created: Math.floor(Date.now() / 1000) - 600}));
  assert.equal(sql.prepare('SELECT plan FROM hub_accounts WHERE id=?').get(owner.id).plan, 'starter');
  assert.equal(sql.prepare('SELECT paid_until FROM hub_billing_subscriptions').get().paid_until, 0);
});

test('cancel-at-period-end preserves paid access, then expires without deleting content', async () => {
  const {state, sql} = setup(); await checkout(); const owner = await account(); const {subscription, periodEnd} = paidSubscription(state, owner);
  subscription.cancel_at_period_end = true; await receiveStripeWebhook(signedEvent(subscription.customer));
  const status = await getBillingStatus(await request('/api/billing')); assert.equal(status.plan, 'pro'); assert.equal(status.subscription.cancelAtPeriodEnd, true);
  const hub = await createPage(await request('/api/pages', {method: 'POST', body: {name: 'Brand', slug: 'paid-brand', template: 'creator'}}));
  await createLink(await request('/api/pages/' + hub.page.id + '/links', {method: 'POST', body: {title: 'Website', url: 'https://example.com/'}}), hub.page.id);
  await updatePage(await request('/api/pages/' + hub.page.id, {method: 'PATCH', body: {profile: {showBranding: false}}}), hub.page.id);
  await publishPage(await request('/api/pages/' + hub.page.id + '/publish', {method: 'POST', body: {}}), hub.page.id);
  assert.equal((await getPublicHub(await request('/api/hubs/paid-brand', {actor: null}), 'paid-brand')).profile.showBranding, false);
  assert.equal(await expireBillingEntitlement(testEnv.DB, owner.id, periodEnd * 1000 + 1), true);
  assert.equal(sql.prepare('SELECT plan FROM hub_accounts WHERE id=?').get(owner.id).plan, 'starter');
  assert.equal(sql.prepare('SELECT published FROM hub_pages WHERE id=?').get(hub.page.id).published, 1);
  assert.equal((await getPublicHub(await request('/api/hubs/paid-brand', {actor: null}), 'paid-brand')).profile.showBranding, true);
});

test('failed renewal does not extend paid time, while payment recovery can extend it', async () => {
  const {state, sql} = setup(); await checkout(); const owner = await account(); const {subscription, invoice, periodEnd} = paidSubscription(state, owner);
  await receiveStripeWebhook(signedEvent(subscription.customer));
  subscription.items.data[0].current_period_end = periodEnd + 30 * 86400; subscription.status = 'past_due'; invoice.status = 'open';
  await receiveStripeWebhook(signedEvent(subscription.customer, {eventId: 'evt_failed', type: 'invoice.payment_failed'}));
  assert.equal(sql.prepare('SELECT paid_until FROM hub_billing_subscriptions').get().paid_until, periodEnd * 1000);
  subscription.status = 'active'; invoice.status = 'paid'; invoice.lines.data[0].period.end = periodEnd + 30 * 86400;
  await receiveStripeWebhook(signedEvent(subscription.customer, {eventId: 'evt_recovered'}));
  assert.equal(sql.prepare('SELECT paid_until FROM hub_billing_subscriptions').get().paid_until, (periodEnd + 30 * 86400) * 1000);
});

test('a canceled completed subscription can subscribe again, but an unresolved completed session cannot', async () => {
  const {state} = setup(); await checkout(); const owner = await account(); const {subscription} = paidSubscription(state, owner);
  const session = [...state.sessions.values()][0]; session.status = 'complete'; session.subscription = subscription.id;
  subscription.status = 'canceled';
  await checkout('year'); assert.equal(state.sessions.size, 2);
  const latest = [...state.sessions.values()].at(-1); latest.status = 'complete'; latest.subscription = 'sub_unknown';
  await assert.rejects(checkout(), error => error.extra.code === 'checkout_processing');
});

test('an expired unknown idempotency reservation is replaced only after the subscription check', async () => {
  const {state, sql} = setup(); state.failCheckoutAfterCreate = true; await assert.rejects(checkout());
  sql.prepare('UPDATE hub_billing_accounts SET checkout_expires_at=?').run(Date.now() - 25 * 3600000);
  [...state.sessions.values()][0].status = 'expired'; await checkout(); assert.equal(state.sessions.size, 2);
  const creates = state.requests.filter(r => r.path === '/v1/checkout/sessions' && r.method === 'POST'); assert.notEqual(creates[0].key, creates[1].key);
});

test('portal binds to the signed-in owner and rejects injected customer/return URLs', async () => {
  const {state} = setup(); await checkout(); const owner = await account();
  await assert.rejects(createBillingPortal(await request('/api/billing/portal', {actor: 'b', method: 'POST', body: {}})), error => error.status === 409);
  await assert.rejects(createBillingPortal(await request('/api/billing/portal', {method: 'POST', body: {customer: 'cus_other', return_url: 'https://evil.example'}})), error => error.status === 400);
  assert.deepEqual(await createBillingPortal(await request('/api/billing/portal', {method: 'POST', body: {}})), {url: 'https://billing.stripe.com/p/session/fixture'});
  assert.equal(state.customers.get(state.portalCustomer).metadata.account_id, owner.id);
  const portal = state.requests.at(-1); assert.equal(portal.form.get('return_url'), ORIGIN + '/studio?billing=portal');
});

test('a return URL cannot grant Pro and syncing needs authentic provider-paid data', async () => {
  const {state, sql} = setup(); await checkout(); const owner = await account();
  const status = await getBillingStatus(await request('/api/billing?billing=success&plan=pro')); assert.equal(status.plan, 'starter');
  const synced = await syncBilling(await request('/api/billing/sync', {method: 'POST', body: {}})); assert.equal(synced.plan, 'starter');
  sql.prepare('UPDATE hub_billing_accounts SET last_synced_at=0').run(); const {subscription} = paidSubscription(state, owner);
  const paid = await syncBilling(await request('/api/billing/sync', {method: 'POST', body: {}})); assert.equal(paid.plan, 'pro');
  assert.equal(paid.subscription.currentPeriodEnd, subscription.items.data[0].current_period_end * 1000);
});

test('disabling new purchases preserves portal/cancellation processing and legacy grants remain untouched', async () => {
  const {state, sql} = setup(); await checkout(); const owner = await account(), legacy = await account('b');
  sql.prepare("UPDATE hub_accounts SET plan='pro' WHERE id=?").run(legacy.id);
  const {subscription} = paidSubscription(state, owner); await receiveStripeWebhook(signedEvent(subscription.customer));
  testEnv.STRIPE_BILLING_ENABLED = 'false';
  assert.equal((await getBillingStatus(await request('/api/billing'))).canManage, true);
  await createBillingPortal(await request('/api/billing/portal', {method: 'POST', body: {}}));
  subscription.status = 'canceled'; await receiveStripeWebhook(signedEvent(subscription.customer, {eventId: 'evt_disabledcancel'}));
  assert.equal(sql.prepare('SELECT plan FROM hub_accounts WHERE id=?').get(owner.id).plan, 'starter');
  await assert.rejects(checkout(), error => error.status === 503);
  assert.equal(await expireBillingEntitlement(testEnv.DB, legacy.id), false); assert.equal((await getBillingStatus(await request('/api/billing', {actor: 'b'}))).plan, 'starter');
});

test('provider redirects are never followed and do not leak the secret to another host', async () => {
  const {state} = setup(); state.redirect = true;
  await assert.rejects(checkout(), error => error.status === 502); assert.equal(state.requests.length, 1);
});

test('checkout stays unavailable until period-end cancellation and billing self-service are configured', async () => {
  const {state} = setup(); delete testEnv.STRIPE_PORTAL_CONFIGURATION_ID;
  assert.equal((await getBillingStatus(await request('/api/billing'))).configured, false);
  await assert.rejects(checkout(), error => error.status === 503); assert.equal(state.sessions.size, 0);
  testEnv.STRIPE_PORTAL_CONFIGURATION_ID = 'bpc_config1'; state.portalMode = 'immediately';
  await assert.rejects(checkout(), error => error.extra.code === 'billing_portal_not_ready'); assert.equal(state.sessions.size, 0);
});

test('public rendering and authenticated access expire Stripe Pro even if a webhook is delayed', async () => {
  const {state, sql} = setup(); await checkout(); const owner = await account(); const {subscription} = paidSubscription(state, owner);
  await receiveStripeWebhook(signedEvent(subscription.customer));
  const hub = await createPage(await request('/api/pages', {method: 'POST', body: {name: 'Retained', slug: 'retained-brand', template: 'creator'}}));
  await createLink(await request('/api/pages/' + hub.page.id + '/links', {method: 'POST', body: {title: 'Website', url: 'https://example.com/'}}), hub.page.id);
  await updatePage(await request('/api/pages/' + hub.page.id, {method: 'PATCH', body: {profile: {showBranding: false}}}), hub.page.id);
  await publishPage(await request('/api/pages/' + hub.page.id + '/publish', {method: 'POST', body: {}}), hub.page.id);
  sql.prepare('UPDATE hub_billing_subscriptions SET paid_until=?').run(Date.now() - 1);
  const publicPage = await getPublicHub(await request('/api/hubs/retained-brand', {actor: null}), 'retained-brand');
  assert.equal(publicPage.profile.showBranding, true); assert.equal(sql.prepare('SELECT count(*) AS n FROM hub_pages WHERE archived=0 AND published=1').get().n, 1);
  sql.prepare("UPDATE hub_accounts SET plan='pro' WHERE id=?").run(owner.id);
  assert.equal((await requireAccount(await request('/api/workspace'))).plan, 'starter');
});

