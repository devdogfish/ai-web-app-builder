import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { BUILTIN_COMPONENTS } from "./builtins";
import type {
  ComponentDefinition,
  ComponentDefinitionInput,
  ComponentSummary,
} from "./contracts";
import {
  compileArticleSource,
  materializeComponentType,
  validateComponentTemplate,
} from "./compiler";
import { initializeComponentsDatabase } from "./db/initialize";
import { normalizeComponentInput } from "./schema";

export const COMPONENTS_DATABASE_ENV = "ARTICLE_BUILDER_DATABASE_PATH";
export const DEFAULT_COMPONENTS_DATABASE_PATH = ".data/article-builder.sqlite";

interface ComponentRow {
  type: string;
  description: string;
  html_template: string;
  schema_json: string;
  ui_hints_json: string;
  default_data_json: string;
  sample_data_json: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ComponentRepositoryOptions {
  filename?: string;
  sqlite?: Database.Database;
  now?: () => Date;
  seedBuiltins?: boolean;
}

export interface DeleteComponentResult {
  type: string;
  materializedArticles: number;
  materializedActiveVersions: number;
  deletedAt: Date;
}

export class ComponentRepositoryError extends Error {
  constructor(
    public readonly code:
      | "component_not_found"
      | "component_exists"
      | "component_type_retired"
      | "component_type_immutable"
      | "component_update_breaks_articles"
      | "corrupt_component",
    message: string,
  ) {
    super(message);
    this.name = "ComponentRepositoryError";
  }
}

function configuredFilename(): string {
  return process.env[COMPONENTS_DATABASE_ENV] ?? DEFAULT_COMPONENTS_DATABASE_PATH;
}

function openSqlite(filename: string): Database.Database {
  if (filename !== ":memory:" && !filename.startsWith("file:")) {
    mkdirSync(dirname(filename), { recursive: true });
  }
  return new Database(filename);
}

function digest(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function tableExists(sqlite: Database.Database, table: string): boolean {
  return Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function parseRow(row: ComponentRow): ComponentDefinition {
  try {
    const normalized = normalizeComponentInput({
      type: row.type,
      description: row.description,
      htmlTemplate: row.html_template,
      schema: JSON.parse(row.schema_json),
      uiHints: JSON.parse(row.ui_hints_json),
      defaultData: JSON.parse(row.default_data_json),
      sampleData: JSON.parse(row.sample_data_json),
    });
    const definition: ComponentDefinition = {
      ...normalized,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    };
    validateComponentTemplate(definition);
    return definition;
  } catch (error) {
    throw new ComponentRepositoryError(
      "corrupt_component",
      `Stored Component ${row.type} is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

function asStoredValues(input: Required<ComponentDefinitionInput>) {
  return {
    type: input.type,
    description: input.description,
    htmlTemplate: input.htmlTemplate,
    schemaJson: JSON.stringify(input.schema),
    uiHintsJson: JSON.stringify(input.uiHints),
    defaultDataJson: JSON.stringify(input.defaultData),
    sampleDataJson: JSON.stringify(input.sampleData),
  };
}

export class ComponentRepository {
  readonly sqlite: Database.Database;

  private readonly ownsConnection: boolean;
  private readonly now: () => Date;

  constructor(options: ComponentRepositoryOptions = {}) {
    this.sqlite = options.sqlite ?? openSqlite(options.filename ?? configuredFilename());
    this.ownsConnection = !options.sqlite;
    this.now = options.now ?? (() => new Date());
    initializeComponentsDatabase(this.sqlite);
    if (options.seedBuiltins !== false) this.seedBuiltins();
  }

  close(): void {
    if (this.ownsConnection && this.sqlite.open) this.sqlite.close();
  }

  list(): ComponentDefinition[] {
    const rows = this.sqlite
      .prepare(
        "SELECT * FROM component_definitions WHERE deleted_at IS NULL ORDER BY type ASC",
      )
      .all() as ComponentRow[];
    return rows.map(parseRow);
  }

  listSummaries(): ComponentSummary[] {
    return this.sqlite
      .prepare(
        "SELECT type, description FROM component_definitions WHERE deleted_at IS NULL ORDER BY type ASC",
      )
      .all() as ComponentSummary[];
  }

  get(type: string): ComponentDefinition | null {
    const row = this.sqlite
      .prepare("SELECT * FROM component_definitions WHERE type = ? AND deleted_at IS NULL")
      .get(type) as ComponentRow | undefined;
    return row ? parseRow(row) : null;
  }

  /** Includes hidden tombstones so historical article versions remain compilable. */
  getForCompilation(type: string): ComponentDefinition | null {
    const row = this.sqlite
      .prepare("SELECT * FROM component_definitions WHERE type = ?")
      .get(type) as ComponentRow | undefined;
    return row ? parseRow(row) : null;
  }

  create(input: ComponentDefinitionInput): ComponentDefinition {
    const normalized = normalizeComponentInput(input);
    const existing = this.sqlite
      .prepare("SELECT deleted_at FROM component_definitions WHERE type = ?")
      .get(normalized.type) as { deleted_at: number | null } | undefined;
    if (existing?.deleted_at) {
      throw new ComponentRepositoryError(
        "component_type_retired",
        `Component type ${normalized.type} was deleted and cannot be reused because history still references it.`,
      );
    }
    if (existing) {
      throw new ComponentRepositoryError(
        "component_exists",
        `Component type ${normalized.type} already exists.`,
      );
    }
    const now = this.now();
    const candidate: ComponentDefinition = {
      ...normalized,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    validateComponentTemplate(candidate);
    const stored = asStoredValues(normalized);
    this.sqlite
      .prepare(`
        INSERT INTO component_definitions (
          type, description, html_template, schema_json, ui_hints_json,
          default_data_json, sample_data_json, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `)
      .run(
        stored.type,
        stored.description,
        stored.htmlTemplate,
        stored.schemaJson,
        stored.uiHintsJson,
        stored.defaultDataJson,
        stored.sampleDataJson,
        now.getTime(),
        now.getTime(),
      );
    return candidate;
  }

  update(type: string, input: ComponentDefinitionInput): ComponentDefinition {
    if (type !== input.type) {
      throw new ComponentRepositoryError(
        "component_type_immutable",
        "Component type cannot be renamed. Create a new Component instead.",
      );
    }
    const current = this.get(type);
    if (!current) {
      throw new ComponentRepositoryError("component_not_found", `Component ${type} does not exist.`);
    }
    const normalized = normalizeComponentInput(input);
    const now = this.now();
    const candidate: ComponentDefinition = {
      ...normalized,
      createdAt: current.createdAt,
      updatedAt: now,
      deletedAt: null,
    };
    validateComponentTemplate(candidate);
    try {
      this.assertStoredReferencesRender(type, candidate);
    } catch (error) {
      throw new ComponentRepositoryError(
        "component_update_breaks_articles",
        `Component update would break a managed article: ${error instanceof Error ? error.message : "invalid existing data"}`,
      );
    }
    const stored = asStoredValues(normalized);
    this.sqlite
      .prepare(`
        UPDATE component_definitions SET
          description = ?, html_template = ?, schema_json = ?, ui_hints_json = ?,
          default_data_json = ?, sample_data_json = ?, updated_at = ?
        WHERE type = ? AND deleted_at IS NULL
      `)
      .run(
        stored.description,
        stored.htmlTemplate,
        stored.schemaJson,
        stored.uiHintsJson,
        stored.defaultDataJson,
        stored.sampleDataJson,
        now.getTime(),
        type,
      );
    return candidate;
  }

  deleteAndMaterialize(type: string): DeleteComponentResult {
    const definition = this.get(type);
    if (!definition) {
      throw new ComponentRepositoryError("component_not_found", `Component ${type} does not exist.`);
    }
    const deletedAt = this.now();
    return this.sqlite.transaction(() => {
      let materializedArticles = 0;
      let materializedActiveVersions = 0;

      if (tableExists(this.sqlite, "articles")) {
        const rows = this.sqlite
          .prepare("SELECT id, html FROM articles WHERE html LIKE '%<Component%'")
          .all() as Array<{ id: string; html: string }>;
        const update = this.sqlite.prepare(
          "UPDATE articles SET html = ?, updated_at = ? WHERE id = ?",
        );
        for (const row of rows) {
          const materialized = materializeComponentType(row.html, type, definition);
          if (materialized === row.html) continue;
          update.run(materialized, deletedAt.getTime(), row.id);
          materializedArticles++;
        }
      }

      if (tableExists(this.sqlite, "versions") && tableExists(this.sqlite, "builder_chats")) {
        const rows = this.sqlite
          .prepare(`
            SELECT version.id, version.html
            FROM versions AS version
            JOIN builder_chats AS chat ON chat.current_version_id = version.id
            WHERE version.html LIKE '%<Component%'
          `)
          .all() as Array<{ id: string; html: string }>;
        const update = this.sqlite.prepare("UPDATE versions SET html = ?, sha256 = ? WHERE id = ?");
        for (const row of rows) {
          const materialized = materializeComponentType(row.html, type, definition);
          if (materialized === row.html) continue;
          const sha256 = digest(materialized);
          update.run(materialized, sha256, row.id);
          materializedActiveVersions++;
        }
      }

      this.sqlite
        .prepare("UPDATE component_definitions SET deleted_at = ?, updated_at = ? WHERE type = ?")
        .run(deletedAt.getTime(), deletedAt.getTime(), type);
      return { type, materializedArticles, materializedActiveVersions, deletedAt };
    })();
  }

  private seedBuiltins(): void {
    const insert = this.sqlite.prepare(`
      INSERT OR IGNORE INTO component_definitions (
        type, description, html_template, schema_json, ui_hints_json,
        default_data_json, sample_data_json, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);
    const now = this.now();
    this.sqlite.transaction(() => {
      for (const input of BUILTIN_COMPONENTS) {
        const normalized = normalizeComponentInput(input);
        const definition: ComponentDefinition = {
          ...normalized,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        validateComponentTemplate(definition);
        const stored = asStoredValues(normalized);
        insert.run(
          stored.type,
          stored.description,
          stored.htmlTemplate,
          stored.schemaJson,
          stored.uiHintsJson,
          stored.defaultDataJson,
          stored.sampleDataJson,
          now.getTime(),
          now.getTime(),
        );
      }
    })();
  }

  private assertStoredReferencesRender(
    type: string,
    candidate: ComponentDefinition,
  ): void {
    const sources: string[] = [];
    if (tableExists(this.sqlite, "articles")) {
      const rows = this.sqlite
        .prepare("SELECT html FROM articles WHERE html LIKE '%<Component%'")
        .all() as Array<{ html: string }>;
      sources.push(...rows.map((row) => row.html));
    }
    if (tableExists(this.sqlite, "versions")) {
      const rows = this.sqlite
        .prepare("SELECT html FROM versions WHERE html LIKE '%<Component%'")
        .all() as Array<{ html: string }>;
      sources.push(...rows.map((row) => row.html));
    }
    const lookup = (requestedType: string) =>
      requestedType === type
        ? candidate
        : this.getForCompilation(requestedType);
    for (const source of sources) compileArticleSource(source, lookup);
  }
}

export function createComponentRepository(options?: ComponentRepositoryOptions): ComponentRepository {
  return new ComponentRepository(options);
}
