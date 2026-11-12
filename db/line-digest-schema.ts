import {integer, sqliteTable, text, index, uniqueIndex, check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
import {hubAccounts} from './schema';

export const hubLinePreferences = sqliteTable('hub_line_preferences', {
  accountId: text('account_id').primaryKey().references(() => hubAccounts.id),
  enabled: integer('enabled').notNull().default(0),
  sendHour: integer('send_hour').notNull().default(9),
  sendMinute: integer('send_minute').notNull().default(0),
  lastTestAt: integer('last_test_at'),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  check('hub_line_preferences_enabled_check', sql`${table.enabled} IN (0, 1)`),
  check('hub_line_preferences_hour_check', sql`${table.sendHour} BETWEEN 0 AND 23`),
  check('hub_line_preferences_minute_check', sql`${table.sendMinute} IN (0, 15, 30, 45)`),
]);
export const hubLineDeliveries = sqliteTable('hub_line_deliveries', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => hubAccounts.id),
  lineUserId: text('line_user_id').notNull(),
  reportDate: text('report_date').notNull(),
  kind: text('kind').notNull(),
  payloadJson: text('payload_json').notNull(),
  retryKey: text('retry_key').notNull().unique(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  firstAttemptAt: integer('first_attempt_at'),
  lastAttemptAt: integer('last_attempt_at'),
  nextAttemptAt: integer('next_attempt_at').notNull(),
  leaseToken: text('lease_token'),
  leaseUntil: integer('lease_until'),
  acceptedAt: integer('accepted_at'),
  lastError: text('last_error'),
}, table => [
  uniqueIndex('hub_line_daily_unique').on(table.accountId, table.reportDate).where(sql`${table.kind} = 'daily'`),
  index('hub_line_delivery_queue_idx').on(table.status, table.nextAttemptAt),
  index('hub_line_delivery_account_idx').on(table.accountId, table.createdAt),
  check('hub_line_deliveries_kind_check', sql`${table.kind} IN ('daily', 'test')`),
  check('hub_line_deliveries_status_check', sql`${table.status} IN ('pending', 'sending', 'retry', 'accepted', 'failed', 'cancelled')`),
]);
export const hubLineWebhookReceipts = sqliteTable('hub_line_webhook_receipts', {
  eventId: text('event_id').primaryKey(),
  occurredAt: integer('occurred_at').notNull(),
  receivedAt: integer('received_at').notNull(),
}, table => [index('hub_line_webhook_received_idx').on(table.receivedAt)]);
