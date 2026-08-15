import { sql } from "drizzle-orm";
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

export const componentDefinitions = sqliteTable(
  "component_definitions",
  {
    id: text("id").primaryKey(),
    tag: text("tag").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    source: text("source").notNull(),
    compiledSource: text("compiled_source").notNull(),
    schemaJson: text("schema_json").notNull(),
    uiHintsJson: text("ui_hints_json").notNull().default("{}"),
    defaultDataJson: text("default_data_json").notNull().default("{}"),
    sampleDataJson: text("sample_data_json").notNull().default("{}"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("component_definitions_deleted_idx").on(table.deletedAt),
    uniqueIndex("component_definitions_active_tag_idx")
      .on(table.tag)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type ComponentDefinitionRow = typeof componentDefinitions.$inferSelect;
