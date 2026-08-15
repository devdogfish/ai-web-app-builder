import type { ArticleImageBinary } from "../../article-images/contracts";
import { articleImageResponse } from "../../article-images/response";
import type { WebsiteAssetPolicy } from "../environment/types";

const PRODUCTION_IMAGE_TIMEOUT_MS = 5_000;

export class PreviewImageProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewImageProxyError";
  }
}

export async function articleImagePreviewResponse({
  image,
  policy,
  productionUrl,
  fetcher = fetch,
}: {
  image: ArticleImageBinary;
  policy: WebsiteAssetPolicy;
  productionUrl: string;
  fetcher?: typeof fetch;
}): Promise<Response> {
  const url = validatedProductionUrl(productionUrl, policy);
  if (image.needsUpload) return articleImageResponse(image);

  try {
    const production = await fetcher(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(PRODUCTION_IMAGE_TIMEOUT_MS),
    });
    const mediaType = production.headers.get("Content-Type") ?? "";
    if (production.ok && mediaType.toLowerCase().startsWith("image/")) {
      const headers = new Headers({
        "Cache-Control": "private, no-store",
        "Content-Type": mediaType,
        "X-Content-Type-Options": "nosniff",
      });
      return new Response(production.body, { headers });
    }
  } catch {
    // Network and timeout failures intentionally fall through to canonical DB bytes.
  }

  return articleImageResponse(image);
}

function validatedProductionUrl(
  value: string,
  policy: WebsiteAssetPolicy,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PreviewImageProxyError(
      "Production image URL is outside the configured CMS asset tree.",
    );
  }

  const cmsOrigin = new URL(policy.cmsOrigin).origin;
  const basePath = policy.assetBasePath.replace(/\/$/, "");
  const inAssetTree =
    url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
  if (
    url.origin !== cmsOrigin ||
    url.username !== "" ||
    url.password !== "" ||
    !inAssetTree
  ) {
    throw new PreviewImageProxyError(
      "Production image URL is outside the configured CMS asset tree.",
    );
  }
  return url;
}
