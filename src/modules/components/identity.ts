import { ComponentValidationError } from "./contracts";
import { COMPONENT_TAG_PATTERN, MAX_COMPONENT_TAG_LENGTH } from "./schema";

/** Human-facing identifier derived deterministically from Component Name. */
export function componentTagFromName(name: string): string {
  const words = name
    .trim()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const tag = words
    .map((word) => `${word[0]!.toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join("");

  if (
    tag.length > MAX_COMPONENT_TAG_LENGTH ||
    !COMPONENT_TAG_PATTERN.test(tag)
  ) {
    throw new ComponentValidationError(
      "invalid_tag",
      "Component Name must produce a PascalCase tag beginning with a letter.",
    );
  }
  return tag;
}
