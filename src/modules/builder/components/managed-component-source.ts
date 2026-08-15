import {
  parseArticleSource,
  type ComponentReference,
} from "../../components/source";
import type { ComponentSummary } from "../../components/contracts";

export interface ManagedComponentReferenceRange {
  from: number;
  to: number;
  index: number;
  id: string;
}

export function managedComponentDisplayTag(
  id: string,
  summaries: readonly ComponentSummary[],
): string {
  return summaries.find((summary) => summary.id === id)?.tag ?? "Component";
}

export function readManagedComponentReference(
  source: string,
  selected: ManagedComponentReferenceRange,
): ComponentReference {
  const candidate = source.slice(selected.from, selected.to);
  const references = parseArticleSource(candidate).references;
  const reference = references[0];
  if (
    references.length !== 1 ||
    !reference ||
    reference.start !== 0 ||
    reference.end !== candidate.length ||
    reference.id !== selected.id
  ) {
    throw new Error("The selected managed Component changed.");
  }
  return {
    ...reference,
    start: selected.from,
    end: selected.to,
    raw: candidate,
  };
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
      id: reference.id,
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
    const idMatch = source
      .slice(from, to)
      .match(/\b(?:id|type)\s*=\s*(["'])([^"']+)\1/);
    const candidate = source.slice(from, to);
    if (idMatch && isStandaloneComponentReference(candidate)) {
      ranges.push({ from, to, index: ranges.length, id: idMatch[2] });
    }
    cursor = to;
  }

  return ranges;
}

function isStandaloneComponentReference(source: string): boolean {
  try {
    const references = parseArticleSource(source).references;
    return (
      references.length === 1 &&
      references[0]!.start === 0 &&
      references[0]!.end === source.length
    );
  } catch {
    return false;
  }
}
