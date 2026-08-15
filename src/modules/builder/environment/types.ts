export type Website = "rbccm" | "cmweb";
export type PreviewSiteProfileId = Website | "unstyled";

export type AssetNamingConvention =
  | "article-slug-position"
  | "article-id-position";

export interface WebsiteAssetPolicy {
  readonly cmsOrigin: string;
  readonly assetBasePath: `/${string}`;
  readonly namingConvention: AssetNamingConvention;
  readonly preferredImageExtension: "webp" | "jpg";
  readonly allowedPreviewOrigins: readonly string[];
}

export interface WebsiteImagePolicy {
  readonly handling: "convert-to-webp" | "preserve-jpeg-or-png";
  readonly preferredFormat: "webp" | "jpeg";
}

export interface WebsiteConfig {
  readonly website: Website;
  readonly name: string;
  readonly storageWebsite: string;
  readonly storageArticleType: string;
  readonly articleTypeName: string;
  readonly previewProfile: PreviewSiteProfileId;
  readonly assetPolicy: WebsiteAssetPolicy;
  readonly imagePolicy: WebsiteImagePolicy;
}

export interface BuilderEnvironment {
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  website: Website;
}

export type EnvironmentReference = BuilderEnvironment;
