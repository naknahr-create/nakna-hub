-- Additive: old links keep their IDs, destinations and analytics history.
ALTER TABLE `hub_links` ADD COLUMN `content_json` text DEFAULT '{}' NOT NULL;
