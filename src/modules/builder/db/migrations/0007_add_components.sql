CREATE TABLE `component_definitions` (
	`type` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`html_template` text NOT NULL,
	`schema_json` text NOT NULL,
	`ui_hints_json` text DEFAULT '{}' NOT NULL,
	`default_data_json` text DEFAULT '{}' NOT NULL,
	`sample_data_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `component_definitions_deleted_idx` ON `component_definitions` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `articles` ADD `host_html_sha256` text;
