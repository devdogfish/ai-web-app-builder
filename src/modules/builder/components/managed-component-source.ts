import { parseArticleSource } from "../../components/source";

export interface ManagedComponentReferenceRange {
  from: number;
  to: number;
  index: number;
  type: string;
}

/** Finds complete managed references while tolerating another partial edit. */
export function findManagedComponentReferenceRanges(
  source: string,
): ManagedComponentReferenceRange[] {
  try {
    return parseArticleSource(source).references.map((reference, index) => ({
      from: reference.start,
      to: reference.end,
      index,
      type: reference.type,
    }));
  } catch {
    // Fall back to a tolerant scan while the document is temporarily invalid.
  }

  const ranges: ManagedComponentReferenceRange[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const from = source.indexOf("<Component", cursor);
    if (from === -1) break;

    const boundary = source[from + "<Component".length];
    if (boundary && !/\s|\//.test(boundary)) {
      cursor = from + "<Component".length;
      continue;
    }

    let quote: '"' | "'" | "`" | null = null;
    let escaped = false;
    let braceDepth = 0;
    let to = -1;

    for (
      let index = from + "<Component".length;
      index < source.length;
      index += 1
    ) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (
        braceDepth === 0 &&
        character === "/" &&
        source[index + 1] === ">"
      ) {
        to = index + 2;
        break;
      }
    }

    if (to === -1) {
      cursor = from + "<Component".length;
      continue;
    }
    const typeMatch = source
      .slice(from, to)
      .match(/\btype\s*=\s*(["'])([^"']+)\1/);
    if (typeMatch) {
      ranges.push({ from, to, index: ranges.length, type: typeMatch[2] });
    }
    cursor = to;
  }

  return ranges;
}
