import type {
  ComponentData,
  ComponentDefinition,
  ComponentFieldSchema,
  ComponentSchema,
} from "./contracts";
import { assertValidComponentData } from "./schema";
import {
  parseArticleSource,
  serializeComponentReference,
  unwrapComponentSourceData,
  type ComponentReference,
} from "./source";

export type ComponentLookup =
  | ReadonlyMap<string, ComponentDefinition>
  | ((type: string) => ComponentDefinition | null | undefined)
  | { getForCompilation(type: string): ComponentDefinition | null };

export type ComponentSourceIssueCode =
  | "unknown_component"
  | "deleted_component"
  | "invalid_data"
  | "invalid_template"
  | "output_too_large";

export interface ComponentSourceIssue {
  code: ComponentSourceIssueCode;
  message: string;
  type: string;
  offset: number;
}

export interface ComponentSourceValidation {
  valid: boolean;
  references: ComponentReference[];
  issues: ComponentSourceIssue[];
}

export class ComponentCompilationError extends Error {
  constructor(
    public readonly code: ComponentSourceIssueCode | "reference_not_found",
    message: string,
    public readonly type?: string,
    public readonly offset?: number,
  ) {
    super(message);
    this.name = "ComponentCompilationError";
  }
}

export const MAX_COMPILED_ARTICLE_BYTES = 4 * 1024 * 1024;
const MAX_TEMPLATE_NESTING_DEPTH = 32;

class BoundedOutputWriter {
  private readonly chunks: string[] = [];
  private outputBytes = 0;

  constructor(private readonly maxOutputBytes: number) {}

  append(chunk: string): void {
    this.outputBytes += new TextEncoder().encode(chunk).byteLength;
    if (this.outputBytes > this.maxOutputBytes) {
      throw new ComponentCompilationError(
        "output_too_large",
        `Compiled Article HTML exceeds the ${this.maxOutputBytes}-byte limit.`,
      );
    }
    this.chunks.push(chunk);
  }

  toString(): string {
    return this.chunks.join("");
  }
}

function lookupComponent(lookup: ComponentLookup, type: string): ComponentDefinition | null {
  if (typeof lookup === "function") return lookup(type) ?? null;
  if ("getForCompilation" in lookup) return lookup.getForCompilation(type);
  return lookup.get(type) ?? null;
}

function deepMerge(defaults: unknown, provided: unknown): unknown {
  if (
    defaults &&
    provided &&
    typeof defaults === "object" &&
    typeof provided === "object" &&
    !Array.isArray(defaults) &&
    !Array.isArray(provided)
  ) {
    const result: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
    for (const [key, value] of Object.entries(provided as Record<string, unknown>)) {
      result[key] = deepMerge(result[key], value);
    }
    return result;
  }
  return provided;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface RenderContext {
  value: unknown;
  schema: ComponentFieldSchema;
  index: number | null;
  root: ComponentData;
  rootSchema: ComponentSchema;
}

function resolvePath(
  context: RenderContext,
  path: string,
): { value: unknown; schema: ComponentFieldSchema | undefined } {
  if (path === "@index") return { value: context.index, schema: { type: "number", integer: true } };
  let value: unknown;
  let schema: ComponentFieldSchema | undefined;
  let segments: string[];
  if (path === "this" || path === ".") {
    return { value: context.value, schema: context.schema };
  }
  if (path.startsWith("$.")) {
    value = context.root;
    schema = context.rootSchema;
    segments = path.slice(2).split(".");
  } else {
    value = context.value;
    schema = context.schema;
    segments = path.split(".");
  }
  for (const segment of segments) {
    if (!segment) return { value: undefined, schema: undefined };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { value: undefined, schema: undefined };
    }
    value = (value as Record<string, unknown>)[segment];
    schema = schema?.type === "object" ? schema.properties[segment] : undefined;
  }
  return { value, schema };
}

function findEachEnd(template: string, contentStart: number): { start: number; end: number } {
  const tokenPattern = /{{\s*(#each\s+[^}]+|\/each)\s*}}/g;
  tokenPattern.lastIndex = contentStart;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(template))) {
    if (match[1].startsWith("#each")) depth++;
    else depth--;
    if (depth === 0) return { start: match.index, end: tokenPattern.lastIndex };
  }
  throw new ComponentCompilationError("invalid_template", "Unclosed {{#each}} block.");
}

function scalarString(value: unknown, path: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new ComponentCompilationError(
    "invalid_template",
    `Template path ${path} resolves to structured data and cannot be interpolated directly.`,
  );
}

function renderRange(
  template: string,
  context: RenderContext,
  output: BoundedOutputWriter,
  depth = 0,
): void {
  if (depth > MAX_TEMPLATE_NESTING_DEPTH) {
    throw new ComponentCompilationError(
      "invalid_template",
      `Component template nesting exceeds ${MAX_TEMPLATE_NESTING_DEPTH} levels.`,
    );
  }
  let cursor = 0;
  while (cursor < template.length) {
    const tokenStart = template.indexOf("{{", cursor);
    if (tokenStart < 0) {
      output.append(template.slice(cursor));
      return;
    }
    output.append(template.slice(cursor, tokenStart));

    if (template.startsWith("{{{", tokenStart)) {
      const tokenEnd = template.indexOf("}}}", tokenStart + 3);
      if (tokenEnd < 0) {
        throw new ComponentCompilationError("invalid_template", "Unclosed raw template placeholder.");
      }
      const path = template.slice(tokenStart + 3, tokenEnd).trim();
      const resolved = resolvePath(context, path);
      if (resolved.schema?.type !== "html") {
        throw new ComponentCompilationError(
          "invalid_template",
          `Raw placeholder ${path} must reference an html field.`,
        );
      }
      output.append(scalarString(resolved.value, path));
      cursor = tokenEnd + 3;
      continue;
    }

    const tokenEnd = template.indexOf("}}", tokenStart + 2);
    if (tokenEnd < 0) {
      throw new ComponentCompilationError("invalid_template", "Unclosed template placeholder.");
    }
    const token = template.slice(tokenStart + 2, tokenEnd).trim();
    if (token.startsWith("#each ")) {
      const path = token.slice("#each ".length).trim();
      const resolved = resolvePath(context, path);
      if (!Array.isArray(resolved.value) || resolved.schema?.type !== "array") {
        throw new ComponentCompilationError(
          "invalid_template",
          `Each path ${path} must reference an array field.`,
        );
      }
      const arraySchema = resolved.schema;
      const block = findEachEnd(template, tokenEnd + 2);
      const inner = template.slice(tokenEnd + 2, block.start);
      resolved.value.forEach((item, index) =>
        renderRange(
          inner,
          {
            ...context,
            value: item,
            schema: arraySchema.items,
            index,
          },
          output,
          depth + 1,
        ),
      );
      cursor = block.end;
      continue;
    }
    if (token === "/each") {
      throw new ComponentCompilationError("invalid_template", "Unexpected {{/each}} block.");
    }
    const resolved = resolvePath(context, token);
    if (!resolved.schema) {
      throw new ComponentCompilationError("invalid_template", `Unknown template path ${token}.`);
    }
    output.append(escapeHtml(scalarString(resolved.value, token)));
    cursor = tokenEnd + 2;
  }
}

export function renderComponentHtml(
  definition: ComponentDefinition,
  sourceData: Record<string, unknown>,
  options: { maxOutputBytes?: number } = {},
): string {
  const output = new BoundedOutputWriter(
    options.maxOutputBytes ?? MAX_COMPILED_ARTICLE_BYTES,
  );
  renderComponentInto(definition, sourceData, output);
  return output.toString();
}

function renderComponentInto(
  definition: ComponentDefinition,
  sourceData: Record<string, unknown>,
  output: BoundedOutputWriter,
): void {
  const merged = deepMerge(definition.defaultData, sourceData) as ComponentData;
  assertValidComponentData(definition.schema, merged);
  renderRange(
    definition.htmlTemplate,
    {
      value: merged,
      schema: definition.schema,
      index: null,
      root: merged,
      rootSchema: definition.schema,
    },
    output,
  );
}

export function validateComponentTemplate(definition: ComponentDefinition): void {
  renderComponentHtml(definition, definition.sampleData);
}

function compileReferenceInto(
  reference: ComponentReference,
  lookup: ComponentLookup,
  output: BoundedOutputWriter,
): void {
  const definition = lookupComponent(lookup, reference.type);
  if (!definition) {
    throw new ComponentCompilationError(
      "unknown_component",
      `Unknown Component type ${reference.type}.`,
      reference.type,
      reference.start,
    );
  }
  try {
    renderComponentInto(
      definition,
      unwrapComponentSourceData(reference.data) as Record<string, unknown>,
      output,
    );
  } catch (error) {
    if (error instanceof ComponentCompilationError) throw error;
    throw new ComponentCompilationError(
      "invalid_data",
      error instanceof Error ? error.message : `Invalid data for ${reference.type}.`,
      reference.type,
      reference.start,
    );
  }
}

export function validateArticleSourceComponents(
  source: string,
  lookup: ComponentLookup,
  options: { allowDeleted?: boolean } = {},
): ComponentSourceValidation {
  const { references } = parseArticleSource(source);
  const issues: ComponentSourceIssue[] = [];
  for (const reference of references) {
    const definition = lookupComponent(lookup, reference.type);
    if (!definition) {
      issues.push({
        code: "unknown_component",
        message: `Unknown Component type ${reference.type}.`,
        type: reference.type,
        offset: reference.start,
      });
      continue;
    }
    if (definition.deletedAt && !options.allowDeleted) {
      issues.push({
        code: "deleted_component",
        message: `Component ${reference.type} has been deleted.`,
        type: reference.type,
        offset: reference.start,
      });
      continue;
    }
    try {
      renderComponentHtml(
        definition,
        unwrapComponentSourceData(reference.data) as Record<string, unknown>,
      );
    } catch (error) {
      issues.push({
        code:
          error instanceof ComponentCompilationError && error.code !== "reference_not_found"
            ? error.code
            : "invalid_data",
        message: error instanceof Error ? error.message : `Invalid Component ${reference.type}.`,
        type: reference.type,
        offset: reference.start,
      });
    }
  }
  return { valid: issues.length === 0, references, issues };
}

export function compileArticleSource(
  source: string,
  lookup: ComponentLookup,
  options: { maxOutputBytes?: number } = {},
): string {
  const { references } = parseArticleSource(source);
  const output = new BoundedOutputWriter(
    options.maxOutputBytes ?? MAX_COMPILED_ARTICLE_BYTES,
  );
  let cursor = 0;
  for (const reference of references) {
    output.append(source.slice(cursor, reference.start));
    compileReferenceInto(reference, lookup, output);
    cursor = reference.end;
  }
  output.append(source.slice(cursor));
  return output.toString();
}

export interface DetachComponentSelector {
  index?: number;
  start?: number;
}

export function detachComponentReference(
  source: string,
  selector: number | DetachComponentSelector,
  lookup: ComponentLookup,
  options: { maxOutputBytes?: number } = {},
): string {
  const { references } = parseArticleSource(source);
  const resolved =
    typeof selector === "number"
      ? references[selector]
      : selector.start !== undefined
        ? references.find((reference) => reference.start === selector.start)
        : references[selector.index ?? -1];
  if (!resolved) {
    throw new ComponentCompilationError("reference_not_found", "Component reference was not found.");
  }
  const output = new BoundedOutputWriter(
    options.maxOutputBytes ?? MAX_COMPILED_ARTICLE_BYTES,
  );
  output.append(source.slice(0, resolved.start));
  compileReferenceInto(resolved, lookup, output);
  output.append(source.slice(resolved.end));
  return output.toString();
}

/** Expands only one Component type, preserving all other managed references. */
export function materializeComponentType(
  source: string,
  type: string,
  definition: ComponentDefinition,
  options: { maxOutputBytes?: number } = {},
): string {
  const { references } = parseArticleSource(source);
  const output = new BoundedOutputWriter(
    options.maxOutputBytes ?? MAX_COMPILED_ARTICLE_BYTES,
  );
  let cursor = 0;
  for (const reference of references) {
    output.append(source.slice(cursor, reference.start));
    if (reference.type === type) {
      renderComponentInto(
        definition,
        unwrapComponentSourceData(reference.data) as Record<string, unknown>,
        output,
      );
    } else {
      output.append(reference.raw);
    }
    cursor = reference.end;
  }
  output.append(source.slice(cursor));
  return output.toString();
}

export function createComponentReference(
  type: string,
  data: ComponentData,
  schema?: ComponentSchema,
): string {
  return serializeComponentReference({ type, data }, schema);
}
