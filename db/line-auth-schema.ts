import {integer, sqliteTable, text, index, uniqueIndex, check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';

export const hubLineAuthAttempts = sqliteTable('hub_line_auth_attempts', {
  stateHash: text('state_hash').primaryKey(), browserHash: text('browser_hash').notNull(),
  verifier: text('verifier').notNull(), nonce: text('nonce').notNull(),
  loginChannelId: text('login_channel_id').notNull(), origin: text('origin').notNull(),
  returnTo: text('return_to').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
}, table => [index('hub_line_auth_attempts_expiry_idx').on(table.expiresAt), index('hub_line_auth_attempts_browser_idx').on(table.browserHash)]);

export const hubLineSessions = sqliteTable('hub_line_sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull(), lineUserId: text('line_user_id').notNull(),
  loginChannelId: text('login_channel_id').notNull(), origin: text('origin').notNull(),
  displayName: text('display_name').notNull(), email: text('email').notNull().default(''),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
}, table => [index('hub_line_sessions_user_idx').on(table.userId), index('hub_line_sessions_expiry_idx').on(table.expiresAt)]);

export const hubLineConnections = sqliteTable('hub_line_connections', {
  userId: text('user_id').primaryKey(), lineUserId: text('line_user_id').notNull(), loginChannelId: text('login_channel_id').notNull(),
  friendStatus: text('friend_status').notNull().default('unknown'), friendshipCheckedAt: integer('friendship_checked_at').notNull(),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [
  uniqueIndex('hub_line_connections_channel_user_idx').on(table.loginChannelId, table.lineUserId),
  check('hub_line_connections_friend_status_check', sql`${table.friendStatus} IN ('following','not_following','unknown')`),
]);
