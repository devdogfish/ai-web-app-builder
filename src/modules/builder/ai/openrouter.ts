import { ARTICLE_MODEL_DEFAULTS } from "./constants";
import {
  errorForProviderPayload,
  parseEventJson,
  streamProviderResponse,
  type DecodedProviderEvent,
} from "./http";
import {
  ArticleModelError,
  type ArticleModel,
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
        { provider: this.provider },
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

  stream(
    request: ArticleModelRequest,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.options.siteUrl) headers["HTTP-Referer"] = this.options.siteUrl;
    if (this.options.appName) headers["X-Title"] = this.options.appName;

    return streamProviderResponse(
      {
        provider: this.provider,
        model: this.model,
        endpoint: this.options.endpoint,
        headers,
        timeoutMs: this.options.timeoutMs,
        maxOutputTokens: this.options.maxOutputTokens,
        fetch: this.options.fetch,
      },
      request,
      options.signal,
      (event) => this.decode(event.data),
      "OpenRouter stream ended before its completion marker.",
    );
  }

  private decode(data: string): DecodedProviderEvent | undefined {
    if (data === "[DONE]") return { type: "finish" };
    const chunk = parseEventJson(data, this.provider) as OpenRouterChunk;
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
    if (content === undefined || content === null) return undefined;
    if (typeof content !== "string") {
      throw new ArticleModelError(
        "malformed_response",
        "OpenRouter returned a malformed content delta.",
        { provider: this.provider },
      );
    }
    return { type: "text-delta", text: content };
  }
}
