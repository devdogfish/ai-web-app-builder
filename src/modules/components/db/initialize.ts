import type Database from "better-sqlite3";

import { initializeDatabase } from "../../builder/db/initialize";

/** Applies the shared Drizzle schema used by Component storage. */
export function initializeComponentsDatabase(sqlite: Database.Database): void {
  initializeDatabase(sqlite);
}
