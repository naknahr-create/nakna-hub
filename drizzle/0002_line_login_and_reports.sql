CREATE TABLE `hub_line_auth_attempts` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`nonce` text NOT NULL,
	`login_channel_id` text NOT NULL,
	`origin` text NOT NULL,
	`return_to` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hub_line_auth_attempts_expiry_idx` ON `hub_line_auth_attempts` (`expires_at`);--> statement-breakpoint
CREATE INDEX `hub_line_auth_attempts_browser_idx` ON `hub_line_auth_attempts` (`browser_hash`);--> statement-breakpoint
CREATE TABLE `hub_line_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`line_user_id` text NOT NULL,
	`login_channel_id` text NOT NULL,
	`friend_status` text DEFAULT 'unknown' NOT NULL,
	`friendship_checked_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "hub_line_connections_friend_status_check" CHECK("hub_line_connections"."friend_status" IN ('following','not_following','unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_line_connections_channel_user_idx` ON `hub_line_connections` (`login_channel_id`,`line_user_id`);--> statement-breakpoint
CREATE TABLE `hub_line_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`line_user_id` text NOT NULL,
	`login_channel_id` text NOT NULL,
	`origin` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hub_line_sessions_user_idx` ON `hub_line_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `hub_line_sessions_expiry_idx` ON `hub_line_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `hub_line_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`line_user_id` text NOT NULL,
	`report_date` text NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`retry_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`first_attempt_at` integer,
	`last_attempt_at` integer,
	`next_attempt_at` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`accepted_at` integer,
	`last_error` text,
	FOREIGN KEY (`account_id`) REFERENCES `hub_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hub_line_deliveries_kind_check" CHECK("hub_line_deliveries"."kind" IN ('daily', 'test')),
	CONSTRAINT "hub_line_deliveries_status_check" CHECK("hub_line_deliveries"."status" IN ('pending', 'sending', 'retry', 'accepted', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_line_deliveries_retry_key_unique` ON `hub_line_deliveries` (`retry_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `hub_line_daily_unique` ON `hub_line_deliveries` (`account_id`,`report_date`) WHERE "hub_line_deliveries"."kind" = 'daily';--> statement-breakpoint
CREATE INDEX `hub_line_delivery_queue_idx` ON `hub_line_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `hub_line_delivery_account_idx` ON `hub_line_deliveries` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `hub_line_preferences` (
	`account_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`send_hour` integer DEFAULT 9 NOT NULL,
	`send_minute` integer DEFAULT 0 NOT NULL,
	`last_test_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `hub_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hub_line_preferences_enabled_check" CHECK("hub_line_preferences"."enabled" IN (0, 1)),
	CONSTRAINT "hub_line_preferences_hour_check" CHECK("hub_line_preferences"."send_hour" BETWEEN 0 AND 23),
	CONSTRAINT "hub_line_preferences_minute_check" CHECK("hub_line_preferences"."send_minute" IN (0, 15, 30, 45))
);
--> statement-breakpoint
CREATE TABLE `hub_line_webhook_receipts` (
	`event_id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hub_line_webhook_received_idx` ON `hub_line_webhook_receipts` (`received_at`);