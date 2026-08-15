import type {
  ComponentData,
  ComponentDefinition,
  ComponentSchema,
} from "./contracts";
import { renderSandboxedComponent } from "./sandbox";
import {
  parseArticleSource,
  serializeComponentReference,
  unwrapComponentSourceData,
  type ComponentReference,
} from "./source";

export type ComponentLookup =
  | ReadonlyMap<string, ComponentDefinition>
  | ((id: string) => ComponentDefinition | null | undefined)
  | { getForCompilation(id: string): ComponentDefinition | null };

export type ComponentSourceIssueCode =
  | "unknown_component"
  | "deleted_component"
  | "invalid_data"
  | "invalid_template"
  | "output_too_large";

export interface ComponentSourceIssue {
  code: ComponentSourceIssueCode;
  message: string;
  id: string;
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
    public readonly id?: string,
    public readonly offset?: number,
  ) {
    super(message);
    this.name = "ComponentCompilationError";
  }
}

export const MAX_COMPILED_ARTICLE_BYTES = 4 * 1024 * 1024;

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

function lookupComponent(
  lookup: ComponentLookup,
  id: string,
): ComponentDefinition | null {
  if (typeof lookup === "function") return lookup(id) ?? null;
  if ("getForCompilation" in lookup) return lookup.getForCompilation(id);
  return lookup.get(id) ?? null;
}

export async function renderComponentHtml(
  definition: ComponentDefinition,
  sourceData: Record<string, unknown>,
  options: { maxOutputBytes?: number } = {},
): Promise<string> {
  const html = await renderSandboxedComponent(definition, sourceData);
  const writer = new BoundedOutputWriter(
    options.maxOutputBytes ?? MAX_COMPILED_ARTICLE_BYTES,
  );
  writer.append(html);
  return writer.toString();
}

export async function validateComponentTemplate(
  definition: ComponentDefinition,
): Promise<void> {
  await renderComponentHtml(definition, definition.sampleData);
}

async function compileReference(
  reference: ComponentReference,
  lookup: ComponentLookup,
  maxOutputBytes: number,
): Promise<string> {
  const definition = lookupComponent(lookup, reference.id);
  if (!definition) {
    throw new ComponentCompilationError(
      "unknown_component",
      `Unknown Component id ${reference.id}.`,
      reference.id,
      reference.start,
    );
  }
  try {
    return await renderComponentHtml(
      definition,
      unwrapComponentSourceData(reference.data) as Record<string, unknown>,
      { maxOutputBytes },
    );
  } catch (error) {
    if (error instanceof ComponentCompilationError) throw error;
    throw new ComponentCompilationError(
      "invalid_data",
      error instanceof Error
        ? error.message
        : `Invalid Component ${reference.id}.`,
      reference.id,
      reference.start,
    );
  }
}

export async function validateArticleSourceComponents(
  source: string,
  lookup: ComponentLookup,
  options: { allowDeleted?: boolean } = {},
): Promise<ComponentSourceValidation> {
  const { references } = parseArticleSource(source);
  const issues: ComponentSourceIssue[] = [];
  for (const reference of references) {
    const definition = lookupComponent(lookup, reference.id);
    if (!definition) {
      issues.push({
        code: "unknown_component",
        message: `Unknown Component id ${reference.id}.`,
        id: reference.id,
        offset: reference.start,
      });
      continue;
    }
    if (definition.deletedAt && !options.allowDeleted) {
      issues.push({
        code: "deleted_component",
        message: `Component ${definition.tag} has been deleted.`,
        id: reference.id,
        offset: reference.start,
      });
      continue;
    }
    try {
      await renderComponentHtml(
        definition,
        unwrapComponentSourceData(reference.data) as Record<string, unknown>,
      );
    } catch (error) {
      issues.push({
        code:
          error instanceof ComponentCompilationError &&
          error.code !== "reference_not_found"
            ? error.code
            : "invalid_data",
        message:
          error instanceof Error
            ? error.message
            : `Invalid Component ${definition.tag}.`,
        id: reference.id,
        offset: reference.start,
      });
    }
  }
  return { valid: issues.length === 0, references, issues };
}

export async function compileArticleSource(
  source: string,
  lookup: ComponentLookup,
  options: { maxOutputBytes?: number } = {},
): Promise<string> {
  const { references } = parseArticleSource(source);
  const maxOutputBytes = options.maxOutputBytes ?? MAX_COMPILED_ARTICLE_BYTES;
  const output = new BoundedOutputWriter(maxOutputBytes);
  let cursor = 0;
  for (const reference of references) {
    output.append(source.slice(cursor, reference.start));
    output.append(await compileReference(reference, lookup, maxOutputBytes));
    cursor = reference.end;
  }
  output.append(source.slice(cursor));
  return output.toString();
}

export interface DetachComponentSelector {
  index?: number;
  start?: number;
}

export async function detachComponentReference(
  source: string,
  selector: number | DetachComponentSelector,
  lookup: ComponentLookup,
  options: { maxOutputBytes?: number } = {},
): Promise<string> {
  const { references } = parseArticleSource(source);
  const resolved =
    typeof selector === "number"
      ? references[selector]
      : selector.start !== undefined
        ? references.find((reference) => reference.start === selector.start)
        : references[selector.index ?? -1];
  if (!resolved) {
    throw new ComponentCompilationError(
      "reference_not_found",
      "Component reference was not found.",
    );
  }
  const maxOutputBytes = options.maxOutputBytes ?? MAX_COMPILED_ARTICLE_BYTES;
  const output = new BoundedOutputWriter(maxOutputBytes);
  output.append(source.slice(0, resolved.start));
  output.append(await compileReference(resolved, lookup, maxOutputBytes));
  output.append(source.slice(resolved.end));
  return output.toString();
}

/** Expands only one Component ID, preserving all other managed references. */
export async function materializeComponentId(
  source: string,
  id: string,
  definition: ComponentDefinition,
  options: { maxOutputBytes?: number } = {},
): Promise<string> {
  const { references } = parseArticleSource(source);
  const maxOutputBytes = options.maxOutputBytes ?? MAX_COMPILED_ARTICLE_BYTES;
  const output = new BoundedOutputWriter(maxOutputBytes);
  let cursor = 0;
  for (const reference of references) {
    output.append(source.slice(cursor, reference.start));
    if (reference.id === id) {
      output.append(
        await renderComponentHtml(
          definition,
          unwrapComponentSourceData(reference.data) as Record<string, unknown>,
          { maxOutputBytes },
        ),
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
  id: string,
  data: ComponentData,
  schema?: ComponentSchema,
): string {
  return serializeComponentReference({ id, data }, schema);
}
