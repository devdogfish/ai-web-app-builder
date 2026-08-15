export const COLLAPSED_CONVERSATION_WIDTH = 0;
export const MIN_CONVERSATION_WIDTH = 20;
export const MAX_CONVERSATION_WIDTH = 80;

export function constrainConversationWidth(nextWidth: number) {
  if (nextWidth < MIN_CONVERSATION_WIDTH) {
    return COLLAPSED_CONVERSATION_WIDTH;
  }

  return Math.min(MAX_CONVERSATION_WIDTH, nextWidth);
}
