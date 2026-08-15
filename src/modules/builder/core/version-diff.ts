import { diff } from "@codemirror/merge";

export interface VersionDiffStats {
  additions: number;
  deletions: number;
}

/** Counts changed source lines using the same diff engine as the workbench. */
export function countVersionDiffLines(
  original: string,
  updated: string,
): VersionDiffStats {
  if (original === updated) return { additions: 0, deletions: 0 };

  const before = splitLines(original);
  const after = splitLines(updated);
  const encoded = encodeLines(before, after);
  if (!encoded) return countUnsharedLines(before, after);
  const changes = diff(encoded.before, encoded.after, {
    scanLimit: 10_000,
    timeout: 100,
  });

  return changes.reduce<VersionDiffStats>(
    (total, change) => ({
      additions: total.additions + change.toB - change.fromB,
      deletions: total.deletions + change.toA - change.fromA,
    }),
    { additions: 0, deletions: 0 },
  );
}

function splitLines(value: string): string[] {
  if (value === "") return [];
  return value.split(/\r\n?|\n/);
}

function encodeLines(
  before: string[],
  after: string[],
): { before: string; after: string } | null {
  const tokens = new Map<string, string>();
  let codeUnit = 1;

  function encode(lines: string[]): string | null {
    let encoded = "";
    for (const line of lines) {
      let token = tokens.get(line);
      if (!token) {
        while (codeUnit >= 0xd800 && codeUnit <= 0xdfff) codeUnit += 1;
        if (codeUnit > 0xffff) return null;
        token = String.fromCharCode(codeUnit++);
        tokens.set(line, token);
      }
      encoded += token;
    }
    return encoded;
  }

  const encodedBefore = encode(before);
  const encodedAfter = encode(after);
  if (encodedBefore === null || encodedAfter === null) return null;
  return { before: encodedBefore, after: encodedAfter };
}

function countUnsharedLines(
  before: string[],
  after: string[],
): VersionDiffStats {
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) {
    suffix += 1;
  }

  return {
    additions: after.length - prefix - suffix,
    deletions: before.length - prefix - suffix,
  };
}
