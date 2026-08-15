CREATE TABLE `host_sync_outbox` (
	`version_id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`html` text NOT NULL,
	`sha256` text NOT NULL,
	`expected_previous_sha256` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `host_sync_outbox_article_version_idx` ON `host_sync_outbox` (`article_id`,`version_number`);