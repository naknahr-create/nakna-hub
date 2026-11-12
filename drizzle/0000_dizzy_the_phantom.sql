CREATE TABLE `deal_admins` (
	`slot` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deal_admins_user_id_unique` ON `deal_admins` (`user_id`);--> statement-breakpoint
CREATE TABLE `deal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`link_id` text,
	`created_at` integer NOT NULL,
	`device` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `deal_links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deal_events_time_idx` ON `deal_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `deal_events_link_time_idx` ON `deal_events` (`link_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `deal_links` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`icon` text DEFAULT 'link' NOT NULL,
	`category` text DEFAULT 'discover' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deal_links_order_idx` ON `deal_links` (`sort_order`);--> statement-breakpoint
CREATE TABLE `deal_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`tagline` text NOT NULL,
	`bio` text NOT NULL,
	`theme` text DEFAULT 'light' NOT NULL,
	`accent` text DEFAULT '#e52935' NOT NULL
);
