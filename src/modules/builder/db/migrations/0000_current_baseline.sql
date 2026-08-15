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
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "article_images_position_check" CHECK("article_images"."position" > 0),
	CONSTRAINT "article_images_size_bytes_check" CHECK("article_images"."size_bytes" > 0),
	CONSTRAINT "article_images_needs_upload_check" CHECK("article_images"."needs_upload" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_images_article_position_unique` ON `article_images` (`article_id`,`position`);--> statement-breakpoint
CREATE INDEX `article_images_article_upload_idx` ON `article_images` (`article_id`,`needs_upload`);--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`website` text NOT NULL,
	`article_type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`host_html_sha256` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `articles_website_idx` ON `articles` (`website`);--> statement-breakpoint
CREATE TABLE `builder_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`current_version_id` text,
	`compact_memory` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `builder_chats_article_unique` ON `builder_chats` (`article_id`);--> statement-breakpoint
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
CREATE INDEX `host_sync_outbox_article_version_idx` ON `host_sync_outbox` (`article_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`kind` text DEFAULT 'chat' NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`error_code` text,
	`duration_ms` integer,
	`thinking_ms` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `builder_chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "messages_role_check" CHECK("messages"."role" IN ('user', 'assistant', 'system')),
	CONSTRAINT "messages_kind_check" CHECK("messages"."kind" IN ('chat', 'source_apply', 'rewind', 'baseline')),
	CONSTRAINT "messages_status_check" CHECK("messages"."status" IN ('complete', 'failed', 'stopped'))
);
--> statement-breakpoint
CREATE INDEX `messages_chat_created_idx` ON `messages` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text,
	`name` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`extracted_text` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `builder_chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "uploads_size_bytes_check" CHECK("uploads"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE INDEX `uploads_chat_created_idx` ON `uploads` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `uploads_message_idx` ON `uploads` (`message_id`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text,
	`parent_version_id` text,
	`restored_from_version_id` text,
	`number` integer NOT NULL,
	`html` text NOT NULL,
	`summary` text NOT NULL,
	`source` text NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `builder_chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "versions_source_check" CHECK("versions"."source" IN ('baseline', 'assistant', 'manual', 'rewind'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_chat_number_unique` ON `versions` (`chat_id`,`number`);--> statement-breakpoint
CREATE INDEX `versions_chat_created_idx` ON `versions` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `versions_message_idx` ON `versions` (`message_id`);--> statement-breakpoint
CREATE TABLE `component_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`tag` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`source` text NOT NULL,
	`compiled_source` text NOT NULL,
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
CREATE UNIQUE INDEX `component_definitions_active_tag_idx` ON `component_definitions` (`tag`) WHERE "component_definitions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TRIGGER `versions_are_immutable`
BEFORE UPDATE ON `versions`
WHEN OLD.id IS NOT (
	SELECT current_version_id FROM builder_chats WHERE id = OLD.chat_id
)
	OR NEW.id IS NOT OLD.id
	OR NEW.chat_id IS NOT OLD.chat_id
	OR NEW.message_id IS NOT OLD.message_id
	OR NEW.parent_version_id IS NOT OLD.parent_version_id
	OR NEW.restored_from_version_id IS NOT OLD.restored_from_version_id
	OR NEW.number IS NOT OLD.number
	OR NEW.summary IS NOT OLD.summary
	OR NEW.source IS NOT OLD.source
	OR NEW.created_at IS NOT OLD.created_at
BEGIN
	SELECT RAISE(ABORT, 'only active version content is mutable');
END;
