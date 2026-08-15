import rbccmManifestJson from "./generated/rbccm-asset-manifest.json";

import type { PreviewSiteProfileId } from "@/modules/builder/environment/types";

export interface PreviewStylesheetAsset {
  href: string;
  media: string | null;
}

export interface PreviewScriptAsset {
  src: string;
  sourceUrl: string;
  async: boolean;
  defer: boolean;
  type: string | null;
}

export interface PreviewAssetManifest {
  profile: PreviewSiteProfileId;
  sourceUrl: string | null;
  stylesheets: PreviewStylesheetAsset[];
  headScripts: PreviewScriptAsset[];
  bodyScripts: PreviewScriptAsset[];
}

export interface PreviewContentContainer {
  style: string;
}

const rbccmManifest = rbccmManifestJson as PreviewAssetManifest;

// CMWeb intentionally remains empty until its production assets are supplied.
const cmwebManifest: PreviewAssetManifest = {
  profile: "cmweb",
  sourceUrl: null,
  stylesheets: [],
  headScripts: [],
  bodyScripts: [],
};

const unstyledManifest: PreviewAssetManifest = {
  profile: "unstyled",
  sourceUrl: null,
  stylesheets: [],
  headScripts: [],
  bodyScripts: [],
};

const manifests: Record<PreviewSiteProfileId, PreviewAssetManifest> = {
  rbccm: rbccmManifest,
  cmweb: cmwebManifest,
  unstyled: unstyledManifest,
};

const contentContainers: Record<
  PreviewSiteProfileId,
  PreviewContentContainer | null
> = {
  rbccm: { style: "padding-inline:15px" },
  cmweb: { style: "padding-inline:15px" },
  unstyled: null,
};

export function getPreviewAssetManifest(
  profile: PreviewSiteProfileId,
): PreviewAssetManifest {
  return manifests[profile];
}

export function getPreviewContentContainer(
  profile: PreviewSiteProfileId,
): PreviewContentContainer | null {
  return contentContainers[profile];
}

export function previewProfileHasAssets(profile: PreviewSiteProfileId): boolean {
  const manifest = getPreviewAssetManifest(profile);
  return (
    manifest.stylesheets.length > 0 ||
    manifest.headScripts.length > 0 ||
    manifest.bodyScripts.length > 0
  );
}
