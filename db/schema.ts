import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const dealProfiles = sqliteTable('deal_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  handle: text('handle').notNull(),
  tagline: text('tagline').notNull(),
  bio: text('bio').notNull(),
  theme: text('theme').notNull().default('light'),
  accent: text('accent').notNull().default('#e52935'),
});

export const dealLinks = sqliteTable('deal_links', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  url: text('url').notNull(),
  icon: text('icon').notNull().default('link'),
  category: text('category').notNull().default('discover'),
  enabled: integer('enabled').notNull().default(1),
  featured: integer('featured').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, table => [index('deal_links_order_idx').on(table.sortOrder)]);

export const dealEvents = sqliteTable('deal_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  linkId: text('link_id').references(() => dealLinks.id),
  createdAt: integer('created_at').notNull(),
  device: text('device').notNull(),
  source: text('source').notNull(),
}, table => [
  index('deal_events_time_idx').on(table.createdAt),
  index('deal_events_link_time_idx').on(table.linkId, table.createdAt),
]);

export const dealAdmins = sqliteTable('deal_admins', {
  slot: text('slot').primaryKey(),
  userId: text('user_id').notNull().unique(),
  email: text('email').notNull(),
  createdAt: integer('created_at').notNull(),
});

// V2: independently owned NAKNA HUB accounts; legacy DEAL! records remain intact.
export const hubAccounts = sqliteTable('hub_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  displayName: text('display_name').notNull(),
  email: text('email').notNull(),
  plan: text('plan').notNull().default('starter'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export const hubPages = sqliteTable('hub_pages', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(()=>hubAccounts.id),
  slug: text('slug').notNull().unique(),
  profileJson: text('profile_json').notNull(),
  revision: integer('revision').notNull().default(1),
  publishedRevision: integer('published_revision').notNull().default(0),
  snapshotJson: text('snapshot_json'),
  published: integer('published').notNull().default(0),
  archived: integer('archived').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  publishedAt: integer('published_at'),
}, table=>[index('hub_pages_account_idx').on(table.accountId,table.archived)]);
export const hubLinks = sqliteTable('hub_links', {
  id: text('id').primaryKey(),
  pageId: text('page_id').notNull().references(()=>hubPages.id),
  type: text('type').notNull().default('link'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  url: text('url').notNull().default(''),
  icon: text('icon').notNull().default('link'),
  enabled: integer('enabled').notNull().default(1),
  featured: integer('featured').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, table=>[index('hub_links_page_order_idx').on(table.pageId,table.sortOrder)]);
export const hubEvents = sqliteTable('hub_events', {
  id: text('id').primaryKey(),
  pageId: text('page_id').notNull().references(()=>hubPages.id),
  type: text('type').notNull(),
  linkId: text('link_id').references(()=>hubLinks.id),
  createdAt: integer('created_at').notNull(),
  device: text('device').notNull(),
  source: text('source').notNull(),
}, table=>[
  index('hub_events_page_time_idx').on(table.pageId,table.createdAt),
  index('hub_events_page_link_time_idx').on(table.pageId,table.linkId,table.createdAt),
]);
export const hubAssets = sqliteTable('hub_assets', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(()=>hubAccounts.id),
  storageKey: text('storage_key').notNull().unique(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at').notNull(),
},table=>[index('hub_assets_account_idx').on(table.accountId)]);
export const hubUpgradeRequests = sqliteTable('hub_upgrade_requests', {
  accountId: text('account_id').primaryKey().references(()=>hubAccounts.id),
  requestedAt: integer('requested_at').notNull(),
  resolvedAt: integer('resolved_at'),
});
export const hubOperators = sqliteTable('hub_operators', {
  slot: text('slot').primaryKey(),
  userId: text('user_id').notNull().unique(),
  createdAt: integer('created_at').notNull(),
});
