import type { ArticleModelResult } from "./types";

export type ArticleModelEditResult = Extract<
  ArticleModelResult,
  { action: "edit" }
>;

export interface ArticleEditRepairRequest {
  attempt: number;
  error: unknown;
  rejected: ArticleModelEditResult;
}

export async function prepareArticleModelEdit<T>(
  initialResult: ArticleModelEditResult,
  options: {
    prepare(source: string): Promise<T>;
    repair(request: ArticleEditRepairRequest): Promise<ArticleModelEditResult>;
    maxRepairAttempts?: number;
  },
): Promise<{ result: ArticleModelEditResult; prepared: T }> {
  const maxRepairAttempts = options.maxRepairAttempts ?? 2;
  let result = initialResult;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return {
        result,
        prepared: await options.prepare(result.articleHtml),
      };
    } catch (error) {
      if (attempt >= maxRepairAttempts) throw error;
      result = await options.repair({
        attempt: attempt + 1,
        error,
        rejected: result,
      });
    }
  }
}

export function buildArticleEditRepairPrompt(
  originalPrompt: string,
  error: unknown,
): string {
  const validationMessage =
    error instanceof Error
      ? error.message.slice(0, 2_000)
      : "Invalid Article Source";

  return `${originalPrompt}

<builder-validation-feedback>
Your previous edit was rejected: ${validationMessage}
Return the requested edit again as a corrected complete Article Source.
Managed Components are block-level and must not be wrapped in <p> or another inline element.
Use an exact Component Tag from the Component Index, for example: <SimpleQuote data={{ quote: "…", attribution: "…" }} />
</builder-validation-feedback>`;
}
