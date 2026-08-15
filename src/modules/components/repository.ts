import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";

import { prepareComponentDefinition } from "./authoring";
import { BUILTIN_COMPONENTS } from "./builtins";
import {
  compileArticleSource,
  materializeComponentId,
  validateComponentTemplate,
} from "./compiler";
import type {
  ComponentDefinition,
  ComponentDefinitionInput,
  ComponentSummary,
} from "./contracts";
import { initializeComponentsDatabase } from "./db/initialize";
import { componentDefinitions } from "./db/schema";
import { formatComponentSource } from "./format-source";
import { componentTagFromName } from "./identity";
import { assertValidPreparedComponentContract } from "./schema";
import { parseArticleSource } from "./source";
import { articles, builderChats, versions } from "../builder/db/schema";

export const COMPONENTS_DATABASE_ENV = "ARTICLE_BUILDER_DATABASE_PATH";
export const DEFAULT_COMPONENTS_DATABASE_PATH = ".data/article-builder.sqlite";

const schema = { componentDefinitions, articles, builderChats, versions };
type ComponentRepositoryDatabase = BetterSQLite3Database<typeof schema>;
type ComponentRow = typeof componentDefinitions.$inferSelect;
export interface ComponentRepositoryOptions {
  filename?: string;
  sqlite?: Database.Database;
  now?: () => Date;
  createId?: () => string;
  seedBuiltins?: boolean;
}

export interface DeleteComponentResult {
  id: string;
  materializedArticles: number;
  materializedActiveVersions: number;
  deletedAt: Date;
}

export class ComponentRepositoryError extends Error {
  constructor(
    public readonly code:
      | "component_not_found"
      | "component_exists"
      | "component_update_breaks_articles"
      | "corrupt_component",
    message: string,
  ) {
    super(message);
    this.name = "ComponentRepositoryError";
  }
}

function configuredFilename(): string {
  return (
    process.env[COMPONENTS_DATABASE_ENV] ?? DEFAULT_COMPONENTS_DATABASE_PATH
  );
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

function parseRow(row: ComponentRow): ComponentDefinition {
  try {
    const definition: ComponentDefinition = {
      id: row.id,
      tag: row.tag,
      name: row.name,
      description: row.description,
      source: row.source,
      compiledSource: row.compiledSource,
      schema: JSON.parse(row.schemaJson),
      uiHints: JSON.parse(row.uiHintsJson),
      defaultData: JSON.parse(row.defaultDataJson),
      sampleData: JSON.parse(row.sampleDataJson),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
    };
    if (!definition.source || !definition.compiledSource) {
      throw new Error("stored source is empty");
    }
    if (componentTagFromName(definition.name) !== definition.tag) {
      throw new Error("stored tag does not match its Component Name");
    }
    assertValidPreparedComponentContract(definition);
    return definition;
  } catch (error) {
    throw new ComponentRepositoryError(
      "corrupt_component",
      `Stored Component ${row.id} is invalid: ${errorMessage(error)}`,
    );
  }
}

function asStoredValues(
  definition: Omit<
    ComponentDefinition,
    "createdAt" | "updatedAt" | "deletedAt"
  >,
) {
  return {
    tag: definition.tag,
    id: definition.id,
    name: definition.name,
    description: definition.description,
    source: definition.source,
    compiledSource: definition.compiledSource,
    schemaJson: JSON.stringify(definition.schema),
    uiHintsJson: JSON.stringify(definition.uiHints),
    defaultDataJson: JSON.stringify(definition.defaultData),
    sampleDataJson: JSON.stringify(definition.sampleData),
  };
}

export class ComponentRepository {
  readonly db: ComponentRepositoryDatabase;
  readonly sqlite: Database.Database;

  private readonly ownsConnection: boolean;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(options: ComponentRepositoryOptions = {}) {
    this.sqlite =
      options.sqlite ?? openSqlite(options.filename ?? configuredFilename());
    this.ownsConnection = !options.sqlite;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    initializeComponentsDatabase(this.sqlite);
    this.db = drizzle(this.sqlite, { schema });
    if (options.seedBuiltins !== false) this.seedBuiltins();
  }

  close(): void {
    if (this.ownsConnection && this.sqlite.open) this.sqlite.close();
  }

  list(): ComponentDefinition[] {
    const rows = this.db
      .select()
      .from(componentDefinitions)
      .where(isNull(componentDefinitions.deletedAt))
      .orderBy(
        asc(componentDefinitions.name),
        asc(componentDefinitions.tag),
        asc(componentDefinitions.id),
      )
      .all();
    return rows.map(parseRow);
  }

  listSummaries(): ComponentSummary[] {
    return this.db
      .select({
        id: componentDefinitions.id,
        tag: componentDefinitions.tag,
        name: componentDefinitions.name,
        description: componentDefinitions.description,
      })
      .from(componentDefinitions)
      .where(isNull(componentDefinitions.deletedAt))
      .orderBy(
        asc(componentDefinitions.name),
        asc(componentDefinitions.tag),
        asc(componentDefinitions.id),
      )
      .all();
  }

  get(id: string): ComponentDefinition | null {
    const row = this.db
      .select()
      .from(componentDefinitions)
      .where(
        and(
          eq(componentDefinitions.id, id),
          isNull(componentDefinitions.deletedAt),
        ),
      )
      .get();
    return row ? parseRow(row) : null;
  }

  getByTag(tag: string): ComponentDefinition | null {
    const row = this.db
      .select()
      .from(componentDefinitions)
      .where(
        and(
          eq(componentDefinitions.tag, tag),
          isNull(componentDefinitions.deletedAt),
        ),
      )
      .get();
    return row ? parseRow(row) : null;
  }

  /** Includes tombstones so historical article versions remain compilable. */
  getForCompilation(id: string): ComponentDefinition | null {
    const row = this.db
      .select()
      .from(componentDefinitions)
      .where(eq(componentDefinitions.id, id))
      .get();
    return row ? parseRow(row) : null;
  }

  async create(input: ComponentDefinitionInput): Promise<ComponentDefinition> {
    const source = await formatComponentSource(input.source);
    const prepared = {
      ...prepareComponentDefinition({ ...input, source }),
      source,
    };
    const existing = this.db
      .select({ id: componentDefinitions.id })
      .from(componentDefinitions)
      .where(
        and(
          eq(componentDefinitions.tag, prepared.tag),
          isNull(componentDefinitions.deletedAt),
        ),
      )
      .get();
    if (existing) {
      throw new ComponentRepositoryError(
        "component_exists",
        `Component tag ${prepared.tag} already exists.`,
      );
    }
    const now = this.now();
    const candidate: ComponentDefinition = {
      ...prepared,
      id: this.createId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await validateComponentTemplate(candidate);
    const stored = asStoredValues(candidate);
    this.db
      .insert(componentDefinitions)
      .values({
        ...stored,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
    return candidate;
  }

  async update(
    id: string,
    input: ComponentDefinitionInput,
  ): Promise<ComponentDefinition> {
    const current = this.get(id);
    if (!current) {
      throw new ComponentRepositoryError(
        "component_not_found",
        `Component ${id} does not exist.`,
      );
    }
    const source = await formatComponentSource(input.source);
    const prepared = {
      ...prepareComponentDefinition({
        ...input,
        name: input.name ?? current.name,
        description: input.description ?? current.description,
        source,
      }),
      source,
    };
    const now = this.now();
    const collision = this.db
      .select({ id: componentDefinitions.id })
      .from(componentDefinitions)
      .where(
        and(
          eq(componentDefinitions.tag, prepared.tag),
          ne(componentDefinitions.id, id),
          isNull(componentDefinitions.deletedAt),
        ),
      )
      .get();
    if (collision) {
      throw new ComponentRepositoryError(
        "component_exists",
        `Component tag ${prepared.tag} already exists.`,
      );
    }
    const candidate: ComponentDefinition = {
      ...prepared,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: now,
      deletedAt: null,
    };
    await validateComponentTemplate(candidate);
    try {
      await this.assertStoredReferencesRender(id, candidate);
    } catch (error) {
      throw new ComponentRepositoryError(
        "component_update_breaks_articles",
        `Component update would break a managed article: ${errorMessage(error)}`,
      );
    }
    const stored = asStoredValues(candidate);
    this.db
      .update(componentDefinitions)
      .set({ ...stored, updatedAt: now })
      .where(
        and(
          eq(componentDefinitions.id, id),
          isNull(componentDefinitions.deletedAt),
        ),
      )
      .run();
    return candidate;
  }

  async deleteAndMaterialize(id: string): Promise<DeleteComponentResult> {
    const definition = this.get(id);
    if (!definition) {
      throw new ComponentRepositoryError(
        "component_not_found",
        `Component ${id} does not exist.`,
      );
    }
    const deletedAt = this.now();
    const articleUpdates: Array<{ id: string; source: string }> = [];
    const versionUpdates: Array<{ id: string; source: string }> = [];

    const articleRows = this.db
      .select({ id: articles.id, html: articles.html })
      .from(articles)
      .where(sql`${articles.html} LIKE '%<Component%'`)
      .all();
    for (const row of articleRows) {
      const source = await materializeComponentId(row.html, id, definition);
      if (source !== row.html) articleUpdates.push({ id: row.id, source });
    }

    const versionRows = this.db
      .select({ id: versions.id, html: versions.html })
      .from(versions)
      .innerJoin(builderChats, eq(builderChats.currentVersionId, versions.id))
      .where(sql`${versions.html} LIKE '%<Component%'`)
      .all();
    for (const row of versionRows) {
      const source = await materializeComponentId(row.html, id, definition);
      if (source !== row.html) versionUpdates.push({ id: row.id, source });
    }

    this.db.transaction((tx) => {
      for (const update of articleUpdates) {
        tx.update(articles)
          .set({ html: update.source, updatedAt: deletedAt })
          .where(eq(articles.id, update.id))
          .run();
      }
      for (const update of versionUpdates) {
        tx.update(versions)
          .set({ html: update.source, sha256: digest(update.source) })
          .where(eq(versions.id, update.id))
          .run();
      }
      tx.update(componentDefinitions)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(eq(componentDefinitions.id, id))
        .run();
    });

    return {
      id,
      materializedArticles: articleUpdates.length,
      materializedActiveVersions: versionUpdates.length,
      deletedAt,
    };
  }

  private seedBuiltins(): void {
    const now = this.now();
    this.db.transaction((tx) => {
      for (const input of BUILTIN_COMPONENTS) {
        const prepared = prepareComponentDefinition(input);
        // Deterministic IDs make repeated built-in seeding idempotent.
        const id = prepared.tag
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .toLowerCase();
        const stored = asStoredValues({ ...prepared, id });
        tx.insert(componentDefinitions)
          .values({
            ...stored,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .onConflictDoNothing()
          .run();
      }
    });
  }

  private async assertStoredReferencesRender(
    id: string,
    candidate: ComponentDefinition,
  ): Promise<void> {
    const sources: string[] = [];
    const articleRows = this.db
      .select({ html: articles.html })
      .from(articles)
      .where(sql`${articles.html} LIKE '%<Component%'`)
      .all();
    sources.push(
      ...articleRows
        .map((row) => row.html)
        .filter((source) => sourceReferencesId(source, id)),
    );
    const versionRows = this.db
      .select({ html: versions.html })
      .from(versions)
      .where(sql`${versions.html} LIKE '%<Component%'`)
      .all();
    sources.push(
      ...versionRows
        .map((row) => row.html)
        .filter((source) => sourceReferencesId(source, id)),
    );
    const lookup = (requestedId: string) =>
      requestedId === id ? candidate : this.getForCompilation(requestedId);
    for (const source of sources) await compileArticleSource(source, lookup);
  }
}

function sourceReferencesId(source: string, id: string): boolean {
  return parseArticleSource(source).references.some(
    (reference) => reference.id === id,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export function createComponentRepository(
  options?: ComponentRepositoryOptions,
): ComponentRepository {
  return new ComponentRepository(options);
}
