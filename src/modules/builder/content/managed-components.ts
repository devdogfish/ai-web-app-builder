import {
  compileArticleSource,
  validateArticleSourceComponents,
  type ComponentLookup,
} from "../../components/compiler";
import { formatArticleSource } from "../../components/format";
import { unavailableComponentImageValues } from "../../components/image-fields";
import { mergeComponentData } from "../../components/sandbox";
import {
  parseArticleSource as parseManagedReferences,
  unwrapComponentSourceData,
} from "../../components/source";

import { BUILDER_DOCUMENT_LIMITS } from "../config/builder";
import { formatArticleHtml } from "./format";
import { assertValidArticleSource } from "./validate";

export class ManagedArticleSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedArticleSourceError";
  }
}

/** Formats HTML around Components and canonicalizes internal references. */
export function formatManagedArticleSource(
  source: string,
  lookup: ComponentLookup,
): Promise<string> {
  return formatArticleSource(
    source,
    formatArticleHtml,
    (id) => componentDefinition(lookup, id)?.schema,
  );
}

/** Validates both ordinary HTML and every managed Component reference. */
export async function assertValidManagedArticleSource(
  source: string,
  lookup: ComponentLookup,
  options: {
    allowBlank?: boolean;
    allowDeleted?: boolean;
    availableImageSources?: ReadonlySet<string>;
    previousSource?: string;
  } = {},
): Promise<void> {
  let parsed: ReturnType<typeof parseManagedReferences>;
  try {
    parsed = parseManagedReferences(source);
  } catch (error) {
    throw new ManagedArticleSourceError(errorMessage(error));
  }

  const masked = replaceReferencesWithValidHtml(source, parsed.references);
  assertValidArticleSource(masked, { allowBlank: options.allowBlank });
  const componentValidation = await validateArticleSourceComponents(
    source,
    lookup,
    {
      allowDeleted: options.allowDeleted ?? false,
    },
  );
  if (!componentValidation.valid) {
    throw new ManagedArticleSourceError(
      componentValidation.issues.map((issue) => issue.message).join(" "),
    );
  }

  if (options.availableImageSources !== undefined) {
    for (const reference of parsed.references) {
      const definition = componentDefinition(lookup, reference.id);
      if (!definition) continue;
      const [unavailable] = unavailableComponentImageValues(
        definition.schema,
        mergeComponentData(
          definition.defaultData,
          unwrapComponentSourceData(reference.data) as Record<string, unknown>,
        ),
        options.availableImageSources,
      );
      if (unavailable) {
        throw new ManagedArticleSourceError(
          `${unavailable.path} must use an image attached to this Article.`,
        );
      }
    }
  }

  if (options.previousSource !== undefined) {
    assertManagedReferencesPreserved(options.previousSource, source);
  }
}

/** Produces the only representation sent to Preview and the CMS host. */
export async function compileManagedArticleSource(
  source: string,
  lookup: ComponentLookup,
  options: { allowDeleted?: boolean } = {},
): Promise<string> {
  await assertValidManagedArticleSource(source, lookup, {
    allowBlank: true,
    allowDeleted: options.allowDeleted,
  });
  const compiled = await compileArticleSource(source, lookup, {
    maxOutputBytes: BUILDER_DOCUMENT_LIMITS.maxSourceBytes,
  });
  assertValidArticleSource(compiled, { allowBlank: true });
  if (!compiled.trim()) return "";
  const formatted = await formatArticleHtml(compiled);
  assertValidArticleSource(formatted, { allowBlank: true });
  return formatted;
}

/**
 * Guards accidental removal by Component ID. The deliberately minimal
 * `{id,data}` syntax has no persistent instance identity, so duplicate
 * references of one Component are semantically interchangeable.
 */
export function assertManagedReferencesPreserved(
  previousSource: string,
  nextSource: string,
): void {
  const previous = referenceCounts(previousSource);
  const next = referenceCounts(nextSource);
  for (const [id, count] of previous) {
    if ((next.get(id) ?? 0) < count) {
      throw new ManagedArticleSourceError(
        `Managed Component ${id} cannot be detached through source editing. Use the confirmed Detach action.`,
      );
    }
  }
}

function referenceCounts(source: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const reference of parseManagedReferences(source).references) {
    counts.set(reference.id, (counts.get(reference.id) ?? 0) + 1);
  }
  return counts;
}

function replaceReferencesWithValidHtml(
  source: string,
  references: ReturnType<typeof parseManagedReferences>["references"],
): string {
  let masked = source;
  for (const reference of [...references].reverse()) {
    masked = `${masked.slice(0, reference.start)}<span data-managed-component=""></span>${masked.slice(reference.end)}`;
  }
  return masked;
}

function componentDefinition(lookup: ComponentLookup, id: string) {
  if (typeof lookup === "function") return lookup(id) ?? null;
  if ("getForCompilation" in lookup) return lookup.getForCompilation(id);
  return lookup.get(id) ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Invalid managed Component source.";
}
