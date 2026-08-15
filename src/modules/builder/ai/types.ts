import type { ARTICLE_MODEL_ERROR_CODES } from "./constants";
import type { BuilderEnvironment } from "../environment/types";

export type ArticleModelErrorCode = (typeof ARTICLE_MODEL_ERROR_CODES)[number];

export class ArticleModelError extends Error {
  readonly code: ArticleModelErrorCode;
  readonly provider?: string;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    code: ArticleModelErrorCode,
    message: string,
    options: { provider?: string; status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "ArticleModelError";
    this.code = code;
    this.provider = options.provider;
    this.status = options.status;
    this.cause = options.cause;
  }
}

export type ArticleConversationTurn = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

export type SelectedUploadExtract = Readonly<{
  id: string;
  name: string;
  text: string;
  mediaType?: string;
  dataUrl?: string;
  dataUrls?: readonly string[];
}>;

/**
 * The page supplies article identity plus one website selector. Fixed website
 * configuration is derived from that selector at the model boundary.
 */
export type ArticleEnvironmentContext = Readonly<BuilderEnvironment>;

export type ArticleModelRequest = Readonly<{
  /** Model-facing Article Source. May contain import-free Component Tags. */
  currentArticleHtml: string;
  currentPrompt: string;
  selectedUploadExtracts?: readonly SelectedUploadExtract[];
  recentRelevantTurns?: readonly ArticleConversationTurn[];
  compactMemory?: string;
  environmentContext?: ArticleEnvironmentContext;
  /** Compact active Component names and descriptions; never implementation HTML. */
  componentIndex?: string;
  /** Specs only for Components used by, or likely relevant to, this request. */
  componentSpecs?: readonly string[];
}>;

export type ArticleModelResult =
  | Readonly<{
      action: "load_components";
      tags: readonly string[];
    }>
  | Readonly<{
      action: "answer";
      response: string;
    }>
  | Readonly<{
      action: "edit";
      summary: string;
      response: string;
      articleHtml: string;
    }>;

export type ArticleModelEvent =
  | Readonly<{ type: "text-delta"; text: string }>
  | Readonly<{ type: "finish"; result: ArticleModelResult }>;

export interface ArticleModel {
  readonly provider: "openrouter" | "cohere";
  readonly model: string;

  stream(
    request: ArticleModelRequest,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): AsyncIterable<ArticleModelEvent>;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
