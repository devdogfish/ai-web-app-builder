import sanitizeHtml from "sanitize-html";

import {
  deriveAssetPath,
  type ArticleAssetContext,
  type WebsiteAssetPolicy,
} from "./assets";

export const BOOTSTRAP_ALLOWED_TAGS = [
  "article",
  "section",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "blockquote",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "small",
  "sup",
  "sub",
  "mark",
  "a",
  "img",
  "figure",
  "figcaption",
  "table",
  "caption",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "pre",
  "code",
  "br",
  "hr",
] as const;

export const BOOTSTRAP_ALLOWED_ATTRIBUTES = Object.freeze({
  "*": ["id", "class", "title", "lang", "dir"],
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height", "loading", "style"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan", "scope"],
});

const DANGEROUS_CONTENT_TAGS = [
  "script",
  "style",
  "iframe",
  "form",
  "input",
  "button",
  "select",
  "option",
  "textarea",
  "object",
  "embed",
] as const;

export interface BootstrapSanitizationInput {
  html: string;
  assetPolicy: WebsiteAssetPolicy;
  article: ArticleAssetContext;
  imagePaths?: readonly string[];
}

/** Bootstrap-only. Do not call this when applying AI or manual source edits. */
export function sanitizeBootstrapHtml({
  html,
  assetPolicy,
  article,
  imagePaths,
}: BootstrapSanitizationInput): string {
  let imagePosition = 0;

  return sanitizeHtml(html, {
    allowedTags: [...BOOTSTRAP_ALLOWED_TAGS],
    allowedAttributes: BOOTSTRAP_ALLOWED_ATTRIBUTES,
    disallowedTagsMode: "discard",
    nonTextTags: [...DANGEROUS_CONTENT_TAGS],
    parseStyleAttributes: false,
    enforceHtmlBoundary: false,
    transformTags: {
      img: (tagName, attributes) => {
        imagePosition += 1;
        const configuredPath = imagePaths?.[imagePosition - 1];
        if (imagePaths && !configuredPath) {
          throw new Error(
            `Bootstrap image ${imagePosition} has no extracted database image.`,
          );
        }
        return {
          tagName,
          attribs: {
            ...attributes,
            src:
              configuredPath ??
              deriveAssetPath(assetPolicy, article, imagePosition),
            style: "max-width: 100%;",
          },
        };
      },
    },
  }).trim();
}
