import { ARTICLE_MODEL_DEFAULTS } from "./constants";
import {
  errorForProviderPayload,
  parseEventJson,
  streamProviderResponse,
  type DecodedProviderEvent,
  type SseEvent,
} from "./http";
import {
  ArticleModelError,
  type ArticleModel,
  type ArticleModelRequest,
  type FetchLike,
} from "./types";

export type CohereAdapterOptions = Readonly<{
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetch?: FetchLike;
}>;

type CohereChunk = {
  type?: unknown;
  code?: unknown;
  status_code?: unknown;
  message?: unknown;
  delta?: {
    finish_reason?: unknown;
    message?: { content?: { text?: unknown; thinking?: unknown } };
  };
};

const TERMINAL_COHERE_EVENTS = new Set(["message-end", "stream-end"]);

export class CohereAdapter implements ArticleModel {
  readonly provider = "cohere" as const;
  readonly model: string;
  private readonly options: Required<
    Pick<
      CohereAdapterOptions,
      "apiKey" | "endpoint" | "timeoutMs" | "maxOutputTokens" | "fetch"
    >
  >;

  constructor(options: CohereAdapterOptions) {
    if (!options.apiKey.trim()) {
      throw new ArticleModelError(
        "configuration",
        "COHERE_API_KEY is required.",
        { provider: this.provider },
      );
    }
    this.model = options.model ?? ARTICLE_MODEL_DEFAULTS.cohere.model;
    this.options = {
      apiKey: options.apiKey,
      endpoint: options.endpoint ?? ARTICLE_MODEL_DEFAULTS.cohere.endpoint,
      timeoutMs: options.timeoutMs ?? ARTICLE_MODEL_DEFAULTS.timeoutMs,
      maxOutputTokens:
        options.maxOutputTokens ?? ARTICLE_MODEL_DEFAULTS.maxOutputTokens,
      fetch: options.fetch ?? globalThis.fetch,
    };
  }

  stream(
    request: ArticleModelRequest,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ) {
    return streamProviderResponse(
      {
        provider: this.provider,
        model: this.model,
        endpoint: this.options.endpoint,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        timeoutMs: this.options.timeoutMs,
        maxOutputTokens: this.options.maxOutputTokens,
        fetch: this.options.fetch,
      },
      request,
      options.signal,
      (event) => this.decode(event),
      "Cohere stream ended before its completion event.",
    );
  }

  private decode({ event, data }: SseEvent): DecodedProviderEvent | undefined {
    const chunk = parseEventJson(data, this.provider) as CohereChunk;
    const type = typeof chunk.type === "string" ? chunk.type : event;
    if (type === "error" || event === "error") {
      throw errorForProviderPayload(
        this.provider,
        chunk.status_code ?? chunk.code,
        chunk.message,
      );
    }
    if (type && TERMINAL_COHERE_EVENTS.has(type)) {
      const finishReason = chunk.delta?.finish_reason;
      if (finishReason === "MAX_TOKENS") {
        throw new ArticleModelError(
          "malformed_response",
          "Cohere stopped before completing Article HTML because the output limit was reached.",
          { provider: this.provider },
        );
      }
      if (typeof finishReason === "string" && finishReason !== "COMPLETE") {
        throw new ArticleModelError(
          "provider",
          `Cohere stopped generation (${finishReason}).`,
          { provider: this.provider },
        );
      }
      return { type: "finish" };
    }
    if (type !== "content-delta") return undefined;
    const content = chunk.delta?.message?.content;
    if (typeof content?.thinking === "string") return undefined;
    if (typeof content?.text !== "string") {
      throw new ArticleModelError(
        "malformed_response",
        "Cohere returned a malformed content delta.",
        { provider: this.provider },
      );
    }
    return { type: "text-delta", text: content.text };
  }
}
