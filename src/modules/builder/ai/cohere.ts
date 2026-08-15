import { ARTICLE_MODEL_DEFAULTS } from "./constants";
import {
  createRequestSignal,
  errorForProviderPayload,
  normalizeThrownError,
  parseEventJson,
  parseSse,
  responseError,
} from "./http";
import { buildArticleMessages, normalizeArticleModelOutput } from "./prompt";
import {
  ArticleModelError,
  type ArticleModel,
  type ArticleModelEvent,
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
        {
          provider: this.provider,
        },
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

  async *stream(
    request: ArticleModelRequest,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): AsyncIterable<ArticleModelEvent> {
    const requestSignal = createRequestSignal(
      options.signal,
      this.options.timeoutMs,
    );
    let fullText = "";
    let sawDone = false;

    try {
      const response = await this.options.fetch(this.options.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: buildArticleMessages(request),
          stream: true,
          max_tokens: this.options.maxOutputTokens,
        }),
        signal: requestSignal.signal,
      });

      if (!response.ok) throw await responseError(response, this.provider);

      for await (const event of parseSse(response.body, this.provider)) {
        const chunk = parseEventJson(event.data, this.provider) as CohereChunk;
        const type = typeof chunk.type === "string" ? chunk.type : event.event;
        if (type === "error" || event.event === "error") {
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
          sawDone = true;
          break;
        }
        if (type !== "content-delta") continue;
        const content = chunk.delta?.message?.content;
        if (typeof content?.thinking === "string") continue;
        if (typeof content?.text !== "string") {
          throw new ArticleModelError(
            "malformed_response",
            "Cohere returned a malformed content delta.",
            { provider: this.provider },
          );
        }
        fullText += content.text;
        yield { type: "text-delta", text: content.text };
      }

      if (!sawDone) {
        throw new ArticleModelError(
          "malformed_response",
          "Cohere stream ended before its completion event.",
          { provider: this.provider },
        );
      }
      yield {
        type: "finish",
        result: normalizeArticleModelOutput(fullText, this.provider),
      };
    } catch (error) {
      throw normalizeThrownError(
        error,
        this.provider,
        options.signal,
        requestSignal.didTimeout(),
      );
    } finally {
      requestSignal.cleanup();
    }
  }
}
