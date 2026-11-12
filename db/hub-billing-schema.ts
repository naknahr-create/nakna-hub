import {sql} from 'drizzle-orm';
import {check, index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {hubAccounts} from './schema';

// Mirrors 0003_stripe_billing.sql so future schema generation preserves billing.
export const hubBillingAccounts = sqliteTable('hub_billing_accounts', {
  accountId: text('account_id').primaryKey().references(() => hubAccounts.id),
  stripeCustomerId: text('stripe_customer_id').unique(),
  managed: integer('managed').notNull().default(0),
  lockToken: text('lock_token'),
  lockUntil: integer('lock_until'),
  checkoutRequestKey: text('checkout_request_key'),
  checkoutPayloadJson: text('checkout_payload_json'),
  checkoutSessionId: text('checkout_session_id'),
  checkoutInterval: text('checkout_interval'),
  checkoutExpiresAt: integer('checkout_expires_at'),
  lastSyncedAt: integer('last_synced_at'),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  check('hub_billing_accounts_managed_check', sql`${table.managed} IN (0,1)`),
  check('hub_billing_accounts_checkout_interval_check', sql`${table.checkoutInterval} IN ('month','year')`),
]);

export const hubBillingSubscriptions = sqliteTable('hub_billing_subscriptions', {
  stripeSubscriptionId: text('stripe_subscription_id').primaryKey(),
  accountId: text('account_id').notNull().references(() => hubAccounts.id),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripePriceId: text('stripe_price_id').notNull(),
  billingInterval: text('billing_interval').notNull(),
  status: text('status').notNull(),
  currentPeriodEnd: integer('current_period_end').notNull(),
  paidUntil: integer('paid_until').notNull().default(0),
  cancelAtPeriodEnd: integer('cancel_at_period_end').notNull().default(0),
  livemode: integer('livemode').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  index('hub_billing_subscriptions_account_idx').on(table.accountId, table.paidUntil),
  check('hub_billing_subscriptions_billing_interval_check', sql`${table.billingInterval} IN ('month','year')`),
  check('hub_billing_subscriptions_cancel_at_period_end_check', sql`${table.cancelAtPeriodEnd} IN (0,1)`),
  check('hub_billing_subscriptions_livemode_check', sql`${table.livemode} IN (0,1)`),
]);

export const hubBillingWebhookEvents = sqliteTable('hub_billing_webhook_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  accountId: text('account_id').references(() => hubAccounts.id),
  createdAt: integer('created_at').notNull(),
  receivedAt: integer('received_at').notNull(),
}, table => [index('hub_billing_webhook_received_idx').on(table.receivedAt)]);
