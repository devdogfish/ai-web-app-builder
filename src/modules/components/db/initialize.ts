import type Database from "better-sqlite3";

export function initializeComponentsDatabase(sqlite: Database.Database): void {
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS component_definitions (
      type TEXT PRIMARY KEY NOT NULL,
      description TEXT NOT NULL,
      html_template TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      ui_hints_json TEXT NOT NULL DEFAULT '{}',
      default_data_json TEXT NOT NULL DEFAULT '{}',
      sample_data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS component_definitions_deleted_idx
      ON component_definitions (deleted_at);
  `);
}
