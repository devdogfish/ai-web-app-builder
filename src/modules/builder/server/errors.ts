import { ARTICLE_MODEL_ERROR_CODES, type ArticleModelErrorCode } from "../ai";

type ErrorLogger = (message: string, error: unknown) => void;

type PublicBuilderErrorOptions = Readonly<{
  fallback: string;
  context: string;
  logger?: ErrorLogger;
}>;

export type PublicBuilderError = Readonly<{
  code: string;
  message: string;
}>;

const PUBLIC_DOMAIN_ERROR_NAMES = new Set([
  "ArticleRepositoryError",
  "ArticleImageRepositoryError",
  "ArticleSourceValidationError",
  "BuilderRefinementError",
  "ProductionImageError",
  "RefinementInProgressError",
  "UploadValidationError",
]);

const PUBLIC_ENVIRONMENT_ERROR_MESSAGES = new Set([
  "Unsupported website and article type combination.",
  "The News Article does not belong to this website and article type.",
]);

export function publicBuilderError(
  error: unknown,
  options: PublicBuilderErrorOptions,
): string {
  return builderErrorDetails(error, options).message;
}

export function builderErrorDetails(
  error: unknown,
  options: PublicBuilderErrorOptions,
): PublicBuilderError {
  if (isModelError(error)) {
    const messages: Record<ArticleModelErrorCode, string> = {
      authentication: "The AI provider rejected its server-side credentials.",
      rate_limit: "The AI provider is temporarily rate-limited. Retry shortly.",
      timeout: "The AI provider timed out before completing its response.",
      cancelled: "Generation stopped.",
      malformed_response:
        "The AI provider returned an incomplete or invalid response.",
      provider: "The AI provider could not complete this request.",
      configuration: error.message,
    };
    return { code: error.code, message: messages[error.code] };
  }

  if (
    error instanceof Error &&
    (PUBLIC_DOMAIN_ERROR_NAMES.has(error.name) ||
      PUBLIC_ENVIRONMENT_ERROR_MESSAGES.has(error.message))
  ) {
    return {
      code: errorCode(error),
      message: error.message,
    };
  }

  (options.logger ?? console.error)(options.context, error);
  return { code: "internal_error", message: options.fallback };
}

function isModelError(
  error: unknown,
): error is Error & { code: ArticleModelErrorCode } {
  if (!(error instanceof Error) || error.name !== "ArticleModelError") {
    return false;
  }
  const code = (error as Error & { code?: unknown }).code;
  return (
    typeof code === "string" &&
    (ARTICLE_MODEL_ERROR_CODES as readonly string[]).includes(code)
  );
}

function errorCode(error: Error): string {
  const explicit = (error as Error & { code?: unknown }).code;
  if (typeof explicit === "string") return explicit;
  if (PUBLIC_ENVIRONMENT_ERROR_MESSAGES.has(error.message)) {
    return "environment_error";
  }
  return error.name.replaceAll(/([a-z])([A-Z])/g, "$1_$2").toLocaleLowerCase();
}
