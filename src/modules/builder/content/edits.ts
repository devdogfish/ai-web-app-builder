export interface ExactEdit {
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}

export type ExactEditFailureCode =
  | "empty_old_text"
  | "missing_match"
  | "ambiguous_match"
  | "overlapping_edits"
  | "stale_version";

export class ExactEditError extends Error {
  constructor(
    readonly code: ExactEditFailureCode,
    message: string,
    readonly editIndex?: number,
  ) {
    super(message);
    this.name = "ExactEditError";
  }
}

interface Replacement {
  start: number;
  end: number;
  replacement: string;
  editIndex: number;
}

function findNonOverlappingMatches(content: string, search: string): number[] {
  const matches: number[] = [];
  let cursor = 0;
  while (cursor <= content.length - search.length) {
    const index = content.indexOf(search, cursor);
    if (index < 0) break;
    matches.push(index);
    cursor = index + search.length;
  }
  return matches;
}

/** Validates every edit against the same base, then applies all or none. */
export function applyExactEditsAtomically(content: string, edits: readonly ExactEdit[]): string {
  if (edits.length === 0) return content;

  const replacements: Replacement[] = [];
  edits.forEach((edit, editIndex) => {
    if (!edit.oldText) {
      throw new ExactEditError("empty_old_text", "Exact edits require non-empty oldText.", editIndex);
    }

    const matches = findNonOverlappingMatches(content, edit.oldText);
    if (matches.length === 0) {
      throw new ExactEditError("missing_match", "oldText was not found in the base source.", editIndex);
    }
    if (!edit.replaceAll && matches.length !== 1) {
      throw new ExactEditError(
        "ambiguous_match",
        "oldText must match exactly once unless replaceAll is enabled.",
        editIndex,
      );
    }

    for (const start of edit.replaceAll ? matches : [matches[0]]) {
      replacements.push({
        start,
        end: start + edit.oldText.length,
        replacement: edit.newText,
        editIndex,
      });
    }
  });

  replacements.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < replacements.length; index += 1) {
    if (replacements[index].start < replacements[index - 1].end) {
      throw new ExactEditError(
        "overlapping_edits",
        "Exact edits overlap in the base source.",
        replacements[index].editIndex,
      );
    }
  }

  let cursor = 0;
  let result = "";
  for (const replacement of replacements) {
    result += content.slice(cursor, replacement.start);
    result += replacement.replacement;
    cursor = replacement.end;
  }
  return result + content.slice(cursor);
}

export function applyVersionedExactEdits(input: {
  content: string;
  baseVersionId: string;
  latestVersionId: string;
  edits: readonly ExactEdit[];
}): string {
  if (input.baseVersionId !== input.latestVersionId) {
    throw new ExactEditError("stale_version", "The source changed after this edit was prepared.");
  }
  return applyExactEditsAtomically(input.content, input.edits);
}
