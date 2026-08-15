import {
  parseArticleSource,
  serializeComponentReference,
  type ComponentReference,
} from "./source";
import type { ComponentSchema } from "./contracts";

export interface MaskedArticleSource {
  masked: string;
  restore(formatted: string): string;
}

export function maskComponentReferences(
  source: string,
  schemaLookup?: (type: string) => ComponentSchema | undefined,
): MaskedArticleSource {
  const { references } = parseArticleSource(source);
  let prefix = "ARTICLE_COMPONENT_REFERENCE_";
  while (source.includes(prefix)) prefix = `_${prefix}`;
  const replacements = new Map<string, string>();
  let masked = source;
  for (const [index, reference] of [...references].reverse().entries()) {
    const originalIndex = references.length - index - 1;
    const token = `<!--${prefix}${originalIndex}-->`;
    replacements.set(
      token,
      serializeComponentReference(reference, schemaLookup?.(reference.type)),
    );
    masked = `${masked.slice(0, reference.start)}${token}${masked.slice(reference.end)}`;
  }
  return {
    masked,
    restore(formatted: string) {
      let restored = formatted;
      for (const [token, directive] of replacements) {
        if (!restored.includes(token)) {
          throw new Error("HTML formatter removed a Component placeholder.");
        }
        restored = restored.replace(token, directive);
      }
      return restored;
    },
  };
}

export async function formatArticleSource(
  source: string,
  formatOrdinaryHtml: (html: string) => string | Promise<string>,
  schemaLookup?: (type: string) => ComponentSchema | undefined,
): Promise<string> {
  const masked = maskComponentReferences(source, schemaLookup);
  return masked.restore(await formatOrdinaryHtml(masked.masked));
}

/** Useful to map editor decorations without exposing directive data. */
export function componentReferenceDisplay(reference: Pick<ComponentReference, "type">): string {
  return `<Component type=${JSON.stringify(reference.type)} />`;
}
