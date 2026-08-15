import { format } from "prettier";

/** Formats the complete HTML snapshot emitted by an article model edit. */
export function formatArticleHtml(source: string): Promise<string> {
  return format(source, { parser: "html" });
}
