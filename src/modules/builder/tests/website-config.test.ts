import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import type {
  ArticleImageBinary,
  ArticleImageCmsUploader,
} from "../../article-images/contracts";
import {
  prepareProductionImage,
  uploadProductionImage,
} from "../environment/production-images";
import { getWebsiteConfig } from "../environment/websites";

describe("fixed website configuration", () => {
  it("enforces the website image preferences", () => {
    expect(getWebsiteConfig("rbccm").assetPolicy.preferredImageExtension).toBe(
      "webp",
    );
    expect(getWebsiteConfig("cmweb").assetPolicy.preferredImageExtension).toBe(
      "jpg",
    );
  });

  it("converts an RBCCM source image to WebP before upload", async () => {
    const source = await image("png");
    const prepared = await prepareProductionImage("rbccm", source);

    expect((await sharp(prepared.image.bytes).metadata()).format).toBe("webp");
    expect(prepared.image.mediaType).toBe("image/webp");
    expect(prepared.image.originalName).toBe("source.png");
    expect(prepared.warnings).toEqual([]);
  });

  it("allows CMWeb PNG with a warning and preserves PNG bytes", async () => {
    const source = await image("png");
    const prepared = await prepareProductionImage("cmweb", source);

    expect((await sharp(prepared.image.bytes).metadata()).format).toBe("png");
    expect(prepared.extension).toBe("png");
    expect(prepared.warnings[0]).toContain("JPEG is strongly recommended");
  });

  it("converts non-PNG CMWeb sources to JPEG", async () => {
    const prepared = await prepareProductionImage("cmweb", await image("webp"));

    expect((await sharp(prepared.image.bytes).metadata()).format).toBe("jpeg");
    expect(prepared.extension).toBe("jpg");
  });

  it("converts a CMWeb PNG to JPEG when explicitly requested", async () => {
    const prepared = await prepareProductionImage("cmweb", await image("png"), {
      convertPngToJpeg: true,
    });

    expect((await sharp(prepared.image.bytes).metadata()).format).toBe("jpeg");
    expect(prepared.extension).toBe("jpg");
  });

  it("passes converted bytes and matching extension to the CMS uploader", async () => {
    const upload = vi.fn<ArticleImageCmsUploader["upload"]>();
    const result = await uploadProductionImage({
      website: "rbccm",
      image: await image("jpeg"),
      productionPath: "/media/articles/story-01.jpg",
      uploader: { upload },
    });

    expect(result.productionPath).toBe("/media/articles/story-01.webp");
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ productionPath: result.productionPath }),
    );
  });
});

async function image(
  format: "jpeg" | "png" | "webp",
): Promise<ArticleImageBinary> {
  const pipeline = sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: "red",
    },
  });
  const bytes = new Uint8Array(
    await (
      format === "jpeg"
        ? pipeline.jpeg()
        : format === "png"
          ? pipeline.png()
          : pipeline.webp()
    ).toBuffer(),
  );
  return {
    id: "image-1",
    articleId: "article-1",
    position: 1,
    originalName: `source.${format === "jpeg" ? "jpg" : format}`,
    mediaType: `image/${format}`,
    sizeBytes: bytes.byteLength,
    bytes,
    needsUpload: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
