import {sql} from 'drizzle-orm';
import {check, index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {hubAccounts, hubPages} from './schema';

export const hubPageControls = sqliteTable('hub_page_controls', {
  pageId: text('page_id').primaryKey().references(() => hubPages.id),
  suspended: integer('suspended').notNull().default(0),
  reason: text('reason').notNull(),
  updatedBy: text('updated_by').notNull().references(() => hubAccounts.id),
  updatedAt: integer('updated_at').notNull(),
}, table => [check('hub_page_controls_suspended_check', sql`${table.suspended} IN (0,1)`)]);
export const hubAccountSupport = sqliteTable('hub_account_support', {
  accountId: text('account_id').primaryKey().references(() => hubAccounts.id),
  note: text('note').notNull().default(''),
  updatedBy: text('updated_by').notNull().references(() => hubAccounts.id),
  updatedAt: integer('updated_at').notNull(),
});
export const hubOperatorAudit = sqliteTable('hub_operator_audit', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').notNull().references(() => hubAccounts.id),
  actorName: text('actor_name').notNull(),
  action: text('action').notNull(),
  targetId: text('target_id').notNull(),
  targetLabel: text('target_label').notNull(),
  reason: text('reason').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [index('hub_operator_audit_time_idx').on(table.createdAt, table.id),
  check('hub_operator_audit_action_check', sql`${table.action} IN ('suspend_hub','restore_hub','update_account_note','resolve_upgrade_request')`)]);
