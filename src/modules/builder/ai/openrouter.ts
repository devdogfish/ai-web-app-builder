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

export type OpenRouterAdapterOptions = Readonly<{
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  siteUrl?: string;
  appName?: string;
  fetch?: FetchLike;
}>;

type OpenRouterChunk = {
  choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
  error?: { code?: unknown; message?: unknown };
};

export class OpenRouterAdapter implements ArticleModel {
  readonly provider = "openrouter" as const;
  readonly model: string;
  private readonly options: Required<
    Pick<
      OpenRouterAdapterOptions,
      "apiKey" | "endpoint" | "timeoutMs" | "maxOutputTokens" | "fetch"
    >
  > &
    Pick<OpenRouterAdapterOptions, "siteUrl" | "appName">;

  constructor(options: OpenRouterAdapterOptions) {
    if (!options.apiKey.trim()) {
      throw new ArticleModelError(
        "configuration",
        "OPENROUTER_API_KEY is required.",
        {
          provider: this.provider,
        },
      );
    }
    this.model = options.model ?? ARTICLE_MODEL_DEFAULTS.openRouter.model;
    this.options = {
      apiKey: options.apiKey,
      endpoint: options.endpoint ?? ARTICLE_MODEL_DEFAULTS.openRouter.endpoint,
      timeoutMs: options.timeoutMs ?? ARTICLE_MODEL_DEFAULTS.timeoutMs,
      maxOutputTokens:
        options.maxOutputTokens ?? ARTICLE_MODEL_DEFAULTS.maxOutputTokens,
      fetch: options.fetch ?? globalThis.fetch,
      siteUrl: options.siteUrl,
      appName: options.appName,
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
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      };
      if (this.options.siteUrl) headers["HTTP-Referer"] = this.options.siteUrl;
      if (this.options.appName) headers["X-Title"] = this.options.appName;

      const response = await this.options.fetch(this.options.endpoint, {
        method: "POST",
        headers,
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
        if (event.data === "[DONE]") {
          sawDone = true;
          break;
        }
        const chunk = parseEventJson(
          event.data,
          this.provider,
        ) as OpenRouterChunk;
        if (chunk.error) {
          throw errorForProviderPayload(
            this.provider,
            chunk.error.code,
            chunk.error.message,
          );
        }
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason === "length") {
          throw new ArticleModelError(
            "malformed_response",
            "OpenRouter stopped before completing Article HTML because the output limit was reached.",
            { provider: this.provider },
          );
        }
        if (
          typeof choice?.finish_reason === "string" &&
          choice.finish_reason !== "stop" &&
          choice.finish_reason !== "length"
        ) {
          throw new ArticleModelError(
            "provider",
            `OpenRouter stopped generation (${choice.finish_reason}).`,
            { provider: this.provider },
          );
        }
        const content = choice?.delta?.content;
        if (content === undefined || content === null) continue;
        if (typeof content !== "string") {
          throw new ArticleModelError(
            "malformed_response",
            "OpenRouter returned a malformed content delta.",
            { provider: this.provider },
          );
        }
        fullText += content;
        yield { type: "text-delta", text: content };
      }

      if (!sawDone) {
        throw new ArticleModelError(
          "malformed_response",
          "OpenRouter stream ended before its completion marker.",
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
