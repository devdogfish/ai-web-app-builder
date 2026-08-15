import { describe, expect, it } from "vitest";

import { resolveAttachmentImageSources } from "../core/attachment-image-source";
import type { BuilderArticleImage } from "../core/contracts";

const image: BuilderArticleImage = {
  id: "image-1",
  position: 1,
  originalName: "article-image-01.png",
  mediaType: "image/png",
  sizeBytes: 42,
  needsUpload: true,
  revision: "2026-08-15T12:00:00.000Z",
  productionPath: "/media/article-01.png",
  productionUrl: "https://cms.example.test/media/article-01.png",
  databasePreviewUrl: "/api/articles/article-1/images/image-1",
  canConvertPngToJpeg: false,
};

describe("attachment image sources", () => {
  it("provides CMS-first and local-fallback URLs for an Article Image upload", () => {
    expect(
      resolveAttachmentImageSources("article-image-01.png", [image]),
    ).toEqual({
      remoteUrl: "https://cms.example.test/media/article-01.png",
      localUrl: "/api/articles/article-1/images/image-1",
    });
  });

  it("uses the upload blob alone when no Article Image matches", () => {
    expect(resolveAttachmentImageSources("reference.png", [image])).toBeNull();
  });
});
