import { BUILDER_CONTEXT_LIMITS } from "../config/builder";

export interface ContextMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface ContextUpload {
  id: string;
  name: string;
  text: string;
}

export interface ContextBudgetOptions {
  maxContextTokens?: number;
  reservedOutputTokens?: number;
  warningRatio?: number;
  retainedTurnsAfterCompaction?: number;
}

export interface ModelContextPlan {
  inputBudgetTokens: number;
  estimatedTokens: number;
  usageRatio: number;
  warning: boolean;
  compacted: boolean;
  blocked: boolean;
  blockingUpload?: { id: string; name: string; estimatedTokens: number };
  messages: ContextMessage[];
  excludedMessageIds: string[];
}

export interface ContextMeterInput {
  fixedContent: readonly string[];
  messages: readonly Pick<ContextMessage, "id" | "text">[];
  compactedThroughMessageId?: string | null;
  compactMemoryTokens?: number;
  selectedUploadTokens?: number;
  options?: Pick<
    ContextBudgetOptions,
    "maxContextTokens" | "reservedOutputTokens" | "warningRatio"
  >;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(
    text.length / BUILDER_CONTEXT_LIMITS.estimatedCharactersPerToken,
  );
}

export function estimateContextUsage(
  content: string | readonly string[],
  options: Pick<
    ContextBudgetOptions,
    "maxContextTokens" | "reservedOutputTokens" | "warningRatio"
  > = {},
): {
  estimatedTokens: number;
  inputBudgetTokens: number;
  usageRatio: number;
  warning: boolean;
} {
  const parts = typeof content === "string" ? [content] : content;
  const estimatedTokens = parts.reduce(
    (sum, part) => sum + itemTokens(part),
    0,
  );
  const inputBudgetTokens = Math.max(
    0,
    (options.maxContextTokens ?? BUILDER_CONTEXT_LIMITS.maxContextTokens) -
      (options.reservedOutputTokens ??
        BUILDER_CONTEXT_LIMITS.reservedOutputTokens),
  );
  const usageRatio =
    inputBudgetTokens === 0 ? 1 : estimatedTokens / inputBudgetTokens;
  return {
    estimatedTokens,
    inputBudgetTokens,
    usageRatio,
    warning:
      usageRatio >=
      (options.warningRatio ?? BUILDER_CONTEXT_LIMITS.warningRatio),
  };
}

/** Estimates raw pressure since the last compaction boundary for the UI meter. */
export function estimateContextMeter(input: ContextMeterInput): {
  estimatedTokens: number;
  inputBudgetTokens: number;
  usageRatio: number;
  percentage: number;
  warning: boolean;
  historyCompacted: boolean;
} {
  const boundaryIndex = input.compactedThroughMessageId
    ? input.messages.findIndex(
        (message) => message.id === input.compactedThroughMessageId,
      )
    : -1;
  const uncompactedMessages = input.messages.slice(boundaryIndex + 1);
  const context = estimateContextUsage(
    [
      ...input.fixedContent,
      ...uncompactedMessages.map((message) => message.text),
    ],
    input.options,
  );
  const estimatedTokens =
    context.estimatedTokens +
    (input.compactMemoryTokens ?? 0) +
    (input.selectedUploadTokens ?? 0);
  const usageRatio =
    context.inputBudgetTokens === 0
      ? 1
      : estimatedTokens / context.inputBudgetTokens;

  return {
    estimatedTokens,
    inputBudgetTokens: context.inputBudgetTokens,
    usageRatio,
    percentage: Math.min(100, Math.round(usageRatio * 100)),
    warning:
      usageRatio >=
      (input.options?.warningRatio ?? BUILDER_CONTEXT_LIMITS.warningRatio),
    historyCompacted: boundaryIndex >= 0,
  };
}

function itemTokens(text: string): number {
  return estimateTokens(text) + BUILDER_CONTEXT_LIMITS.estimatedTokensPerItem;
}

/**
 * Keeps all essential current input and selects newest conversation turns within
 * the remaining budget. Selected uploads are intentionally one-request-only.
 */
export function planModelContext(input: {
  systemInstructions: string;
  compactMemory?: string | null;
  currentRequest: string;
  currentDocument: string;
  additionalFixedContent?: readonly string[];
  recentMessages: readonly ContextMessage[];
  selectedUploads?: readonly ContextUpload[];
  options?: ContextBudgetOptions;
}): ModelContextPlan {
  const maxContextTokens =
    input.options?.maxContextTokens ?? BUILDER_CONTEXT_LIMITS.maxContextTokens;
  const reservedOutputTokens =
    input.options?.reservedOutputTokens ??
    BUILDER_CONTEXT_LIMITS.reservedOutputTokens;
  const warningRatio =
    input.options?.warningRatio ?? BUILDER_CONTEXT_LIMITS.warningRatio;
  const retainedTurnsAfterCompaction =
    input.options?.retainedTurnsAfterCompaction ??
    BUILDER_CONTEXT_LIMITS.retainedTurnsAfterCompaction;
  const inputBudgetTokens = Math.max(
    0,
    maxContextTokens - reservedOutputTokens,
  );
  const selectedUploads = input.selectedUploads ?? [];

  const fixedTokens =
    itemTokens(input.systemInstructions) +
    (input.compactMemory ? itemTokens(input.compactMemory) : 0) +
    itemTokens(input.currentRequest) +
    itemTokens(input.currentDocument) +
    (input.additionalFixedContent ?? []).reduce(
      (sum, content) => sum + itemTokens(content),
      0,
    );
  const uploadTokens = selectedUploads.map((upload) => ({
    ...upload,
    estimatedTokens: itemTokens(upload.text),
  }));
  const essentialTokens =
    fixedTokens +
    uploadTokens.reduce((sum, upload) => sum + upload.estimatedTokens, 0);

  const rawEstimatedTokens =
    essentialTokens +
    input.recentMessages.reduce(
      (sum, message) => sum + itemTokens(message.text),
      0,
    );
  const rawUsageRatio =
    inputBudgetTokens === 0 ? 1 : rawEstimatedTokens / inputBudgetTokens;
  const shouldCompact =
    input.recentMessages.length > retainedTurnsAfterCompaction &&
    rawUsageRatio >= warningRatio;
  const candidateMessages = shouldCompact
    ? input.recentMessages.slice(-Math.max(0, retainedTurnsAfterCompaction))
    : input.recentMessages;
  const selectedReversed: ContextMessage[] = [];
  let estimatedTokens = essentialTokens;
  for (let index = candidateMessages.length - 1; index >= 0; index -= 1) {
    const message = candidateMessages[index];
    if (!message) continue;
    const tokens = itemTokens(message.text);
    if (estimatedTokens + tokens <= inputBudgetTokens) {
      selectedReversed.push(message);
      estimatedTokens += tokens;
    } else {
      // Keep conversational context contiguous; skipping a newer turn can make
      // an older response misleading or impossible to interpret.
      break;
    }
  }
  const messages = selectedReversed.reverse();
  const selectedIds = new Set(messages.map((message) => message.id));
  const excludedMessageIds = input.recentMessages
    .filter((message) => !selectedIds.has(message.id))
    .map((message) => message.id);
  const blocked = essentialTokens > inputBudgetTokens;
  const usageRatio =
    inputBudgetTokens === 0 ? 1 : estimatedTokens / inputBudgetTokens;

  const largestUpload = uploadTokens.reduce<
    (typeof uploadTokens)[number] | undefined
  >(
    (largest, upload) =>
      !largest || upload.estimatedTokens > largest.estimatedTokens
        ? upload
        : largest,
    undefined,
  );

  return {
    inputBudgetTokens,
    estimatedTokens,
    usageRatio,
    warning: usageRatio >= warningRatio,
    compacted: excludedMessageIds.length > 0,
    blocked,
    blockingUpload:
      blocked && fixedTokens <= inputBudgetTokens && largestUpload
        ? {
            id: largestUpload.id,
            name: largestUpload.name,
            estimatedTokens: largestUpload.estimatedTokens,
          }
        : undefined,
    messages,
    excludedMessageIds,
  };
}
