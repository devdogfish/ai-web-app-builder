import { parseArticleSource, serializeComponentReference } from "./source";
import type { ComponentSchema } from "./contracts";

export interface MaskedArticleSource {
  masked: string;
  restore(formatted: string): string;
}

export function maskComponentReferences(
  source: string,
  schemaLookup?: (id: string) => ComponentSchema | undefined,
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
      serializeComponentReference(reference, schemaLookup?.(reference.id)),
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
  schemaLookup?: (id: string) => ComponentSchema | undefined,
): Promise<string> {
  const normalized = liftParagraphWrappedComponents(source);
  const masked = maskComponentReferences(normalized, schemaLookup);
  return masked.restore(await formatOrdinaryHtml(masked.masked));
}

/** Managed Components are blocks, so a paragraph cannot be their parent. */
function liftParagraphWrappedComponents(source: string): string {
  const { references } = parseArticleSource(source);
  let normalized = source;

  for (const reference of [...references].reverse()) {
    const before = normalized.slice(0, reference.start);
    const after = normalized.slice(reference.end);
    const openingParagraph = before.match(/<p(?:\s[^>]*)?>[ \t\r\n]*$/i);
    const closingParagraph = after.match(/^[ \t\r\n]*<\/p\s*>/i);
    if (!openingParagraph || !closingParagraph) continue;

    const paragraphStart = reference.start - openingParagraph[0].length;
    const paragraphEnd = reference.end + closingParagraph[0].length;
    normalized = `${normalized.slice(0, paragraphStart)}${reference.raw}${normalized.slice(paragraphEnd)}`;
  }

  return normalized;
}

/** Useful to map editor decorations without exposing directive data. */
export function componentReferenceDisplay(tag: string): string {
  return `<${tag} />`;
}
