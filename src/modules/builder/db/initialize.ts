import { join } from "node:path";

import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const migrationsFolder = join(
  process.cwd(),
  "src/modules/builder/db/migrations",
);

/** Applies the current Drizzle schema to a local SQLite connection. */
export function initializeDatabase(sqlite: Database.Database): void {
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder });
}
