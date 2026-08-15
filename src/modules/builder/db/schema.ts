import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`);

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    website: text("website").notNull(),
    articleType: text("article_type").notNull(),
    title: text("title").notNull().default(""),
    html: text("html").notNull().default(""),
    hostHtmlSha256: text("host_html_sha256"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("articles_website_idx").on(table.website)],
);

export const builderChats = sqliteTable(
  "builder_chats",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    currentVersionId: text("current_version_id"),
    compactMemory: text("compact_memory"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [uniqueIndex("builder_chats_article_unique").on(table.articleId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => builderChats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    kind: text("kind", {
      enum: ["chat", "source_apply", "rewind", "baseline"],
    })
      .notNull()
      .default("chat"),
    content: text("content").notNull(),
    status: text("status", { enum: ["complete", "failed", "stopped"] })
      .notNull()
      .default("complete"),
    errorCode: text("error_code"),
    durationMs: integer("duration_ms"),
    thinkingMs: integer("thinking_ms"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("messages_chat_created_idx").on(table.chatId, table.createdAt),
  ],
);

export const versions = sqliteTable(
  "versions",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => builderChats.id, { onDelete: "cascade" }),
    // Logical references intentionally have no FK action: version identity and
    // lineage must never be rewritten by ON DELETE SET NULL during cleanup.
    messageId: text("message_id"),
    parentVersionId: text("parent_version_id"),
    restoredFromVersionId: text("restored_from_version_id"),
    number: integer("number").notNull(),
    html: text("html").notNull(),
    summary: text("summary").notNull(),
    source: text("source", {
      enum: ["baseline", "assistant", "manual", "rewind"],
    }).notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("versions_chat_number_unique").on(table.chatId, table.number),
    index("versions_chat_created_idx").on(table.chatId, table.createdAt),
    index("versions_message_idx").on(table.messageId),
  ],
);

export const hostSyncOutbox = sqliteTable(
  "host_sync_outbox",
  {
    versionId: text("version_id")
      .primaryKey()
      .references(() => versions.id, { onDelete: "cascade" }),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    html: text("html").notNull(),
    sha256: text("sha256").notNull(),
    expectedPreviousSha256: text("expected_previous_sha256"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("host_sync_outbox_article_version_idx").on(
      table.articleId,
      table.versionNumber,
    ),
  ],
);

export const uploads = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => builderChats.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    extractedText: text("extracted_text"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("uploads_chat_created_idx").on(table.chatId, table.createdAt),
    index("uploads_message_idx").on(table.messageId),
  ],
);

export const articleRelations = relations(articles, ({ one }) => ({
  chat: one(builderChats),
}));

export const builderChatRelations = relations(
  builderChats,
  ({ one, many }) => ({
    article: one(articles, {
      fields: [builderChats.articleId],
      references: [articles.id],
    }),
    messages: many(messages),
    versions: many(versions),
    uploads: many(uploads),
  }),
);

export const messageRelations = relations(messages, ({ one, many }) => ({
  chat: one(builderChats, {
    fields: [messages.chatId],
    references: [builderChats.id],
  }),
  versions: many(versions),
  uploads: many(uploads),
}));

export const versionRelations = relations(versions, ({ one }) => ({
  chat: one(builderChats, {
    fields: [versions.chatId],
    references: [builderChats.id],
  }),
  message: one(messages, {
    fields: [versions.messageId],
    references: [messages.id],
  }),
}));

export const uploadRelations = relations(uploads, ({ one }) => ({
  chat: one(builderChats, {
    fields: [uploads.chatId],
    references: [builderChats.id],
  }),
  message: one(messages, {
    fields: [uploads.messageId],
    references: [messages.id],
  }),
}));

export type Article = typeof articles.$inferSelect;
export type BuilderChat = typeof builderChats.$inferSelect;
export type BuilderMessage = typeof messages.$inferSelect;
export type ArticleVersion = typeof versions.$inferSelect;
export type ReferenceUpload = typeof uploads.$inferSelect;
