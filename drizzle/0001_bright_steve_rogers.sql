CREATE TABLE `hub_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`plan` text DEFAULT 'starter' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_accounts_user_id_unique` ON `hub_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `hub_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `hub_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_assets_storage_key_unique` ON `hub_assets` (`storage_key`);--> statement-breakpoint
CREATE INDEX `hub_assets_account_idx` ON `hub_assets` (`account_id`);--> statement-breakpoint
CREATE TABLE `hub_events` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`type` text NOT NULL,
	`link_id` text,
	`created_at` integer NOT NULL,
	`device` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `hub_pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `hub_links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hub_events_page_time_idx` ON `hub_events` (`page_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `hub_events_page_link_time_idx` ON `hub_events` (`page_id`,`link_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `hub_links` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`type` text DEFAULT 'link' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT 'link' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `hub_pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hub_links_page_order_idx` ON `hub_links` (`page_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `hub_operators` (
	`slot` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_operators_user_id_unique` ON `hub_operators` (`user_id`);--> statement-breakpoint
CREATE TABLE `hub_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`slug` text NOT NULL,
	`profile_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`published_revision` integer DEFAULT 0 NOT NULL,
	`snapshot_json` text,
	`published` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `hub_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_pages_slug_unique` ON `hub_pages` (`slug`);--> statement-breakpoint
CREATE INDEX `hub_pages_account_idx` ON `hub_pages` (`account_id`,`archived`);--> statement-breakpoint
CREATE TABLE `hub_upgrade_requests` (
	`account_id` text PRIMARY KEY NOT NULL,
	`requested_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `hub_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
