CREATE TABLE IF NOT EXISTS `hub_account_support` (
	`account_id` text PRIMARY KEY NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `hub_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `hub_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hub_operator_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`target_label` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `hub_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hub_operator_audit_action_check" CHECK("hub_operator_audit"."action" IN ('suspend_hub','restore_hub','update_account_note','resolve_upgrade_request'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hub_operator_audit_time_idx` ON `hub_operator_audit` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hub_page_controls` (
	`page_id` text PRIMARY KEY NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`reason` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `hub_pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `hub_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hub_page_controls_suspended_check" CHECK("hub_page_controls"."suspended" IN (0,1))
);
