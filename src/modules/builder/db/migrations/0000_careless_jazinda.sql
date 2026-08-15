CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`website` text NOT NULL,
	`article_type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
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
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('user', 'assistant', 'system')),
	`kind` text DEFAULT 'chat' NOT NULL CHECK (`kind` IN ('chat', 'source_apply', 'rewind', 'baseline')),
	`content` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL CHECK (`status` IN ('complete', 'failed', 'stopped')),
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `builder_chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_chat_created_idx` ON `messages` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text,
	`name` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL CHECK (`size_bytes` >= 0),
	`storage_key` text NOT NULL,
	`extracted_text` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `builder_chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
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
	`source` text NOT NULL CHECK (`source` IN ('baseline', 'assistant', 'manual', 'rewind')),
	`sha256` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `builder_chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_chat_number_unique` ON `versions` (`chat_id`,`number`);--> statement-breakpoint
CREATE INDEX `versions_chat_created_idx` ON `versions` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `versions_message_idx` ON `versions` (`message_id`);--> statement-breakpoint
CREATE TRIGGER `versions_are_immutable`
BEFORE UPDATE ON `versions`
BEGIN
	SELECT RAISE(ABORT, 'versions are immutable');
END;
