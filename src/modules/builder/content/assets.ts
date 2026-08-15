export const ASSET_TEMPLATE_TOKENS = [
  "websiteId",
  "articleType",
  "articleTypeId",
  "articleId",
  "id",
  "articleSlug",
  "slug",
  "position",
  "index",
  "extension",
  "ext",
] as const;

export interface ArticleAssetContext {
  websiteId: string;
  articleTypeId: string;
  articleId: string;
  articleSlug: string;
}

export interface WebsiteAssetPolicy {
  cmsOrigin: string;
  assetBasePath: string;
  /** Optional override; otherwise namingConvention selects a built-in path. */
  pathTemplate?: string;
  namingConvention?: "article-slug-position" | "article-id-position";
  preferredImageExtension: string;
  positionPadLength?: number;
}

const SAFE_SEGMENT = /[^a-zA-Z0-9._-]+/g;

function safeSegment(value: string, field: string): string {
  const cleaned = value
    .trim()
    .replace(SAFE_SEGMENT, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error(
      `Cannot derive an asset path: ${field} is empty or unsafe.`,
    );
  }

  return cleaned;
}

function normalizeBasePath(value: string): string {
  const segments = value.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Asset base path cannot contain dot segments.");
  }
  return segments
    .map((segment) => safeSegment(segment, "assetBasePath"))
    .join("/");
}

export function validateAssetPolicy(policy: WebsiteAssetPolicy): void {
  const origin = new URL(policy.cmsOrigin);
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new Error("CMS origin must use HTTP or HTTPS.");
  }
  if (origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error(
      "CMS origin must be an origin without a path, query, or hash.",
    );
  }
  if (origin.username || origin.password) {
    throw new Error("CMS origin cannot contain credentials.");
  }

  normalizeBasePath(policy.assetBasePath);
  safeSegment(
    policy.preferredImageExtension.replace(/^\.+/, ""),
    "preferredImageExtension",
  );

  if (policy.pathTemplate !== undefined) {
    if (!policy.pathTemplate.trim() || policy.pathTemplate.startsWith("/")) {
      throw new Error("Asset path template must be a non-empty relative path.");
    }
    if (
      policy.pathTemplate
        .split("/")
        .some((segment) => segment === "." || segment === "..")
    ) {
      throw new Error("Asset path template cannot contain dot segments.");
    }
  }
  if (
    policy.positionPadLength !== undefined &&
    (!Number.isInteger(policy.positionPadLength) ||
      policy.positionPadLength < 1 ||
      policy.positionPadLength > 12)
  ) {
    throw new Error("Asset position padding must be an integer from 1 to 12.");
  }
}

export function deriveAssetPath(
  policy: WebsiteAssetPolicy,
  context: ArticleAssetContext,
  documentPosition: number,
): string {
  validateAssetPolicy(policy);
  if (!Number.isInteger(documentPosition) || documentPosition < 1) {
    throw new Error("Document image position must be a positive integer.");
  }

  const tokens: Record<(typeof ASSET_TEMPLATE_TOKENS)[number], string> = {
    websiteId: safeSegment(context.websiteId, "websiteId"),
    articleType: safeSegment(context.articleTypeId, "articleTypeId"),
    articleTypeId: safeSegment(context.articleTypeId, "articleTypeId"),
    articleId: safeSegment(context.articleId, "articleId"),
    id: safeSegment(context.articleId, "articleId"),
    articleSlug: safeSegment(context.articleSlug, "articleSlug"),
    slug: safeSegment(context.articleSlug, "articleSlug"),
    position: String(documentPosition).padStart(
      policy.positionPadLength ?? 2,
      "0",
    ),
    index: String(documentPosition).padStart(
      policy.positionPadLength ?? 2,
      "0",
    ),
    extension: safeSegment(
      policy.preferredImageExtension.replace(/^\.+/, "").toLowerCase(),
      "preferredImageExtension",
    ),
    ext: safeSegment(
      policy.preferredImageExtension.replace(/^\.+/, "").toLowerCase(),
      "preferredImageExtension",
    ),
  };

  const builtInTemplate =
    policy.namingConvention === "article-id-position"
      ? "{articleId}-{position}.{extension}"
      : "{articleSlug}-{position}.{extension}";
  const rendered = (policy.pathTemplate ?? builtInTemplate).replace(
    /\{([^{}]+)\}/g,
    (match, expression: string) => {
      const [name, format] = expression.split(":", 2);
      if (
        (name === "index" || name === "position") &&
        /^0?\d+$/.test(format ?? "")
      ) {
        const width = Number(format);
        if (width < 1 || width > 12)
          throw new Error("Asset position padding must be from 1 to 12.");
        return String(documentPosition).padStart(width, "0");
      }
      return name in tokens && format === undefined
        ? tokens[name as keyof typeof tokens]
        : match;
    },
  );
  if (/[{}]/.test(rendered)) {
    throw new Error("Asset path template contains an unsupported token.");
  }

  const relativeSegments = rendered.split("/").filter(Boolean);
  if (relativeSegments.length === 0) {
    throw new Error("Asset path template produced an empty path.");
  }
  const relativePath = relativeSegments
    .map((segment) => safeSegment(segment, "pathTemplate"))
    .join("/");
  const basePath = normalizeBasePath(policy.assetBasePath);

  return `/${[basePath, relativePath].filter(Boolean).join("/")}`;
}

export function resolveAssetUrl(
  policy: WebsiteAssetPolicy,
  assetPath: string,
): string {
  validateAssetPolicy(policy);
  if (!assetPath.startsWith("/") || assetPath.startsWith("//")) {
    throw new Error("Only root-relative asset paths can be resolved.");
  }
  if (
    assetPath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("Asset paths cannot contain dot segments.");
  }
  return new URL(assetPath, policy.cmsOrigin).toString();
}

export function replaceAssetExtension(
  assetPath: string,
  extension: string,
): string {
  const safeExtension = safeSegment(
    extension.replace(/^\.+/, "").toLowerCase(),
    "extension",
  );
  return /\.[^./]+$/.test(assetPath)
    ? assetPath.replace(/\.[^./]+$/, `.${safeExtension}`)
    : `${assetPath}.${safeExtension}`;
}
