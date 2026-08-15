import { CohereAdapter } from "./cohere";
import { OpenRouterAdapter } from "./openrouter";
import { ArticleModelError, type ArticleModel, type FetchLike } from "./types";

export type ArticleModelEnvironment = Readonly<{
  [key: string]: string | undefined;
  AI_PROVIDER?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_NAME?: string;
  COHERE_API_KEY?: string;
  COHERE_MODEL?: string;
}>;

/** Server composition root. Never expose its environment or returned adapter to a Client Component. */
export function createArticleModelFromEnv(
  environment: ArticleModelEnvironment = process.env,
  dependencies: Readonly<{ fetch?: FetchLike }> = {},
): ArticleModel {
  const provider = environment.AI_PROVIDER?.trim().toLowerCase();

  if (provider === "openrouter") {
    return new OpenRouterAdapter({
      apiKey: environment.OPENROUTER_API_KEY ?? "",
      model: environment.OPENROUTER_MODEL,
      siteUrl: environment.OPENROUTER_SITE_URL,
      appName: environment.OPENROUTER_APP_NAME,
      fetch: dependencies.fetch,
    });
  }

  if (provider === "cohere") {
    return new CohereAdapter({
      apiKey: environment.COHERE_API_KEY ?? "",
      model: environment.COHERE_MODEL,
      fetch: dependencies.fetch,
    });
  }

  throw new ArticleModelError(
    "configuration",
    provider
      ? `Unsupported AI_PROVIDER: ${provider}.`
      : "AI_PROVIDER must be set to openrouter or cohere.",
  );
}
