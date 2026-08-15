const FALLBACK_SUMMARY = "Article update";

interface VersionSummaryRecord {
  id: string;
  number: number;
  restoredFromVersionId: string | null;
  source: string;
  summary: string;
}

/** Validates the model-generated two-to-four-word Version label. */
export function normalizeVersionSummary(value: string): string {
  const words =
    value
      .replaceAll(/<[^>]*>/g, " ")
      .match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? [];

  if (words.length < 2 || words.length > 4) return FALLBACK_SUMMARY;
  words[0] = capitalize(words[0]!);
  return words.join(" ");
}

export function revertedVersionSummary(targetNumber: number): string {
  return `Reverted v${targetNumber}`;
}

/** Derives target-aware labels for legacy restores without rewriting history. */
export function resolveVersionSummary(
  version: VersionSummaryRecord,
  versions: readonly Pick<VersionSummaryRecord, "id" | "number">[],
): string {
  if (version.source === "rewind" && version.restoredFromVersionId) {
    const target = versions.find(
      (candidate) => candidate.id === version.restoredFromVersionId,
    );
    if (target) return revertedVersionSummary(target.number);
  }

  return normalizeVersionSummary(version.summary);
}

function capitalize(word: string): string {
  if (/^[A-Z\d]{2,}$/.test(word)) return word;
  return `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`;
}
