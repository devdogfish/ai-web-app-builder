export const ATTACHMENT_ONLY_PROMPT =
  "Use the attached reference material to update the current article where appropriate.";

export function hasRefinementInput(
  prompt: string,
  uploadIds: readonly string[],
): boolean {
  return prompt.trim().length > 0 || uploadIds.length > 0;
}

export function resolveRefinementPrompt(
  prompt: string,
  uploadIds: readonly string[],
): string {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt) return trimmedPrompt;
  return uploadIds.length > 0 ? ATTACHMENT_ONLY_PROMPT : "";
}
