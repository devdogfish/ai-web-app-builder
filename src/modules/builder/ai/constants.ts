import { BUILDER_CONTEXT_LIMITS } from "../config/builder";

export const ARTICLE_MODEL_DEFAULTS = {
  timeoutMs: 60_000,
  maxOutputTokens: BUILDER_CONTEXT_LIMITS.reservedOutputTokens,
  openRouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "google/gemini-3.1-flash-lite",
  },
  cohere: {
    endpoint: "https://api.cohere.com/v2/chat",
    model: "command-a-plus-05-2026",
  },
} as const;

export const ARTICLE_MODEL_ERROR_CODES = [
  "authentication",
  "rate_limit",
  "timeout",
  "cancelled",
  "malformed_response",
  "provider",
  "configuration",
] as const;
