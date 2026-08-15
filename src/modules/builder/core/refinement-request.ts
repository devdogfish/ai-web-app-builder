export function hasRefinementInput(
  prompt: string,
  uploadIds: readonly string[],
): boolean {
  return prompt.trim().length > 0 || uploadIds.length > 0;
}

export function resolveRefinementPrompt(prompt: string): string {
  return prompt.trim();
}
