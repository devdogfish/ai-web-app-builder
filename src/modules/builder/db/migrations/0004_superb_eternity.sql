CREATE TABLE `article_images` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`position` integer NOT NULL,
	`original_name` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`bytes` blob NOT NULL,
	`needs_upload` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_images_article_position_unique` ON `article_images` (`article_id`,`position`);--> statement-breakpoint
CREATE INDEX `article_images_article_upload_idx` ON `article_images` (`article_id`,`needs_upload`);