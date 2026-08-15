import type { ArticleAssetContext } from "../content/assets";
import type { BuilderEnvironment, Website, WebsiteConfig } from "./types";

export const WEBSITE_CONFIGS = {
  rbccm: {
    website: "rbccm",
    name: "RBC Capital Markets",
    storageWebsite: "website-1",
    storageArticleType: "article-type-1",
    articleTypeName: "RBCCM article",
    previewProfile: "rbccm",
    assetPolicy: {
      cmsOrigin: "https://www.rbccm.com",
      assetBasePath: "/media/articles",
      namingConvention: "article-slug-position",
      preferredImageExtension: "webp",
      allowedPreviewOrigins: ["https://www.rbccm.com"],
    },
    imagePolicy: {
      handling: "convert-to-webp",
      preferredFormat: "webp",
    },
  },
  cmweb: {
    website: "cmweb",
    name: "CMWeb",
    storageWebsite: "website-2",
    storageArticleType: "article-type-2",
    articleTypeName: "CMWeb article",
    previewProfile: "cmweb",
    assetPolicy: {
      cmsOrigin: "https://cmweb.example.invalid",
      assetBasePath: "/media/articles",
      namingConvention: "article-id-position",
      preferredImageExtension: "jpg",
      allowedPreviewOrigins: ["https://cmweb.example.invalid"],
    },
    imagePolicy: {
      handling: "preserve-jpeg-or-png",
      preferredFormat: "jpeg",
    },
  },
} as const satisfies Record<Website, WebsiteConfig>;

export const WEBSITES = ["rbccm", "cmweb"] as const satisfies readonly Website[];

export function getWebsiteConfig(website: Website): WebsiteConfig {
  return WEBSITE_CONFIGS[website];
}

export function getDevelopmentArticleId(website: Website): string {
  return website === "rbccm" ? "local-article" : `local-${website}-article`;
}

export function switchDevelopmentWebsite(
  website: Website,
  createId: () => string = () => crypto.randomUUID(),
): BuilderEnvironment {
  return {
    articleId: `local-${website}-${createId()}`,
    articleTitle: "Untitled article",
    articleSlug: "untitled-article",
    website,
  };
}

export function getArticleAssetContext(
  environment: BuilderEnvironment,
): ArticleAssetContext {
  const config = getWebsiteConfig(environment.website);
  return {
    websiteId: config.storageWebsite,
    articleTypeId: config.storageArticleType,
    articleId: environment.articleId,
    articleSlug: environment.articleSlug,
  };
}
