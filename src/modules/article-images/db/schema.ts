import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { articles } from "@/modules/builder/db/schema";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`);

export const articleImages = sqliteTable(
  "article_images",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    originalName: text("original_name").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    needsUpload: integer("needs_upload", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("article_images_article_position_unique").on(
      table.articleId,
      table.position,
    ),
    index("article_images_article_upload_idx").on(
      table.articleId,
      table.needsUpload,
    ),
  ],
);

export type ArticleImageRow = typeof articleImages.$inferSelect;
