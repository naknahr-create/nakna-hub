import {integer,sqliteTable,text,index,primaryKey,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {hubAccounts,hubPages} from './schema';
export const hubTeams=sqliteTable('hub_teams',{
 id:text('id').primaryKey(),ownerAccountId:text('owner_account_id').notNull().references(()=>hubAccounts.id),name:text('name').notNull(),archived:integer('archived').notNull().default(0),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[index('hub_teams_owner_idx').on(t.ownerAccountId,t.archived)]);
export const hubTeamPages=sqliteTable('hub_team_pages',{
 teamId:text('team_id').notNull().references(()=>hubTeams.id),pageId:text('page_id').notNull().references(()=>hubPages.id),
},t=>[primaryKey({columns:[t.teamId,t.pageId]}),index('hub_team_pages_page_idx').on(t.pageId,t.teamId)]);
export const hubTeamInvites=sqliteTable('hub_team_invites',{
 id:text('id').primaryKey(),teamId:text('team_id').notNull().references(()=>hubTeams.id),tokenHash:text('token_hash').notNull().unique(),role:text('role').notNull(),canPublish:integer('can_publish').notNull().default(0),createdBy:text('created_by').notNull().references(()=>hubAccounts.id),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),claimedAccountId:text('claimed_account_id').references(()=>hubAccounts.id),claimedAt:integer('claimed_at'),revokedAt:integer('revoked_at'),
},t=>[index('hub_team_invites_team_idx').on(t.teamId,t.createdAt)]);
export const hubTeamMembers=sqliteTable('hub_team_members',{
 id:text('id').primaryKey(),teamId:text('team_id').notNull().references(()=>hubTeams.id),accountId:text('account_id').notNull().references(()=>hubAccounts.id),inviteId:text('invite_id').notNull().references(()=>hubTeamInvites.id),role:text('role').notNull(),canPublish:integer('can_publish').notNull().default(0),status:text('status').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[uniqueIndex('hub_team_members_unique_idx').on(t.teamId,t.accountId),index('hub_team_members_account_idx').on(t.accountId,t.status,t.teamId)]);
export const hubTeamAudit=sqliteTable('hub_team_audit',{
 id:text('id').primaryKey(),teamId:text('team_id').notNull().references(()=>hubTeams.id),pageId:text('page_id').references(()=>hubPages.id),actorAccountId:text('actor_account_id').notNull().references(()=>hubAccounts.id),actorName:text('actor_name').notNull(),action:text('action').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('hub_team_audit_team_idx').on(t.teamId,t.createdAt)]);
