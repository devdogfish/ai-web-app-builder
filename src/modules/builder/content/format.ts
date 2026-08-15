import { formatHtmlSource } from "./format-html";

/** Formats the complete HTML snapshot emitted by an article model edit. */
export function formatArticleHtml(source: string): Promise<string> {
  return formatHtmlSource(source);
}
