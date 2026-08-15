import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import rbccmManifest from "../preview/generated/rbccm-asset-manifest.json";
import {
  getPreviewAssetManifest,
  previewProfileHasAssets,
} from "../preview/site-profiles";

const root = resolve(import.meta.dirname, "../../../..");
const imageExtensions = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);

describe("preview asset profiles", () => {
  it("mirrors every manifest asset as a local file", () => {
    expect(rbccmManifest.stylesheets).toHaveLength(12);
    expect(
      rbccmManifest.headScripts.length + rbccmManifest.bodyScripts.length,
    ).toBe(25);

    for (const assetPath of rbccmManifest.downloaded) {
      expect(assetPath).toMatch(/^\/preview-sites\/rbccm\//);
      expect(
        existsSync(join(root, "public", assetPath.replace(/^\//, ""))),
        assetPath,
      ).toBe(true);
      expect(imageExtensions.has(extname(assetPath).toLowerCase()), assetPath).toBe(
        false,
      );
    }
  });

  it("keeps CSS image references remote instead of downloading images", () => {
    for (const stylesheet of rbccmManifest.stylesheets) {
      const css = readFileSync(
        join(root, "public", stylesheet.href.replace(/^\//, "")),
        "utf8",
      );
      expect(css).not.toMatch(
        /url\(["']?\/preview-sites\/rbccm\/[^)]*\.(?:avif|gif|ico|jpe?g|png|svg|webp)/i,
      );
    }
  });

  it("leaves a first-class empty CMWeb extension point", () => {
    expect(previewProfileHasAssets("rbccm")).toBe(true);
    expect(previewProfileHasAssets("cmweb")).toBe(false);
    expect(getPreviewAssetManifest("cmweb")).toEqual({
      profile: "cmweb",
      sourceUrl: null,
      stylesheets: [],
      headScripts: [],
      bodyScripts: [],
    });
  });
});
