import { BUILDER_DOCUMENT_LIMITS } from "../config/builder";
import sanitizeHtml from "sanitize-html";

export type ArticleSourceIssueCode =
  | "empty"
  | "too_large"
  | "contains_null"
  | "markdown_fence"
  | "not_html"
  | "incomplete_document"
  | "unclosed_tag";

export interface ArticleSourceIssue {
  code: ArticleSourceIssueCode;
  message: string;
}

export interface ArticleSourceValidation {
  valid: boolean;
  byteLength: number;
  issues: ArticleSourceIssue[];
}

export function validateArticleSource(
  source: string,
  options: { allowBlank?: boolean; maxBytes?: number } = {},
): ArticleSourceValidation {
  const trimmed = source.trim();
  const byteLength = new TextEncoder().encode(source).byteLength;
  const issues: ArticleSourceIssue[] = [];

  if (!trimmed && !options.allowBlank) {
    issues.push({ code: "empty", message: "Article HTML cannot be empty." });
  }
  if (byteLength > (options.maxBytes ?? BUILDER_DOCUMENT_LIMITS.maxSourceBytes)) {
    issues.push({ code: "too_large", message: "Article HTML exceeds the configured source limit." });
  }
  if (source.includes("\0")) {
    issues.push({ code: "contains_null", message: "Article HTML contains a null character." });
  }
  if (/^\s*```(?:html)?\s|\s```\s*$/i.test(source)) {
    issues.push({ code: "markdown_fence", message: "Article HTML must not be wrapped in a Markdown fence." });
  }
  if (trimmed && !/<[a-z!][^>]*>/i.test(trimmed)) {
    issues.push({ code: "not_html", message: "Article source must contain HTML markup." });
  }

  const completeDocument = /<(?:!doctype\s+html|html)(?:\s|>)/i.test(trimmed);
  if (completeDocument && !/<\/html\s*>(?:\s|<!--[\s\S]*?-->)*$/i.test(trimmed)) {
    issues.push({
      code: "incomplete_document",
      message: "A complete HTML document must end with a closing html tag.",
    });
  }

  const optionalClosingTags = new Set([
    "p", "li", "dt", "dd", "rt", "rp", "optgroup", "option", "colgroup",
    "thead", "tbody", "tfoot", "tr", "td", "th",
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
  ]);
  const implicitlyClosed = new Set<string>();
  if (trimmed) {
    sanitizeHtml(source, {
      allowedTags: false,
      allowedAttributes: false,
      allowVulnerableTags: true,
      onCloseTag(name, isImplied) {
        if (isImplied && !optionalClosingTags.has(name)) implicitlyClosed.add(name);
      },
    });
  }
  if (implicitlyClosed.size > 0) {
    issues.push({
      code: "unclosed_tag",
      message: `Article HTML has unclosed structural tags: ${[...implicitlyClosed].join(", ")}.`,
    });
  }

  return { valid: issues.length === 0, byteLength, issues };
}

export class ArticleSourceValidationError extends Error {
  constructor(readonly validation: ArticleSourceValidation) {
    super(validation.issues.map((issue) => issue.message).join(" "));
    this.name = "ArticleSourceValidationError";
  }
}

export function assertValidArticleSource(
  source: string,
  options?: { allowBlank?: boolean; maxBytes?: number },
): void {
  const validation = validateArticleSource(source, options);
  if (!validation.valid) throw new ArticleSourceValidationError(validation);
}
