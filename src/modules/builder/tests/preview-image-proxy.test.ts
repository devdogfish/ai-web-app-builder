import { describe, expect, it, vi } from "vitest";

import type { ArticleImageBinary } from "../../article-images/contracts";
import { articleImagePreviewResponse } from "../server/preview-image-proxy";

const image: ArticleImageBinary = {
  id: "image-1",
  articleId: "article-1",
  position: 1,
  originalName: "source.png",
  mediaType: "image/webp",
  sizeBytes: 3,
  needsUpload: true,
  createdAt: new Date("2026-08-15T12:00:00.000Z"),
  updatedAt: new Date("2026-08-15T12:00:00.000Z"),
  bytes: new Uint8Array([1, 2, 3]),
};

const policy = {
  cmsOrigin: "https://cms.example.test",
  assetBasePath: "/media/articles" as const,
  namingConvention: "article-slug-position" as const,
  preferredImageExtension: "webp" as const,
  allowedPreviewOrigins: ["https://cms.example.test"],
};

describe("Article Image Preview proxy", () => {
  it("returns newer database bytes without requesting CMS", async () => {
    const fetcher = vi.fn<typeof fetch>();

    const response = await articleImagePreviewResponse({
      image,
      policy,
      productionUrl:
        "https://cms.example.test/media/articles/story-01.webp",
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(image.bytes);
  });

  it("returns database bytes when the CMS image is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Unavailable", {
        status: 503,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const response = await articleImagePreviewResponse({
      image: { ...image, needsUpload: false },
      policy,
      productionUrl:
        "https://cms.example.test/media/articles/story-01.webp",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(image.bytes);
  });

  it("returns a valid CMS image before consulting database bytes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([9, 8]), {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    );

    const response = await articleImagePreviewResponse({
      image: { ...image, needsUpload: false },
      policy,
      productionUrl:
        "https://cms.example.test/media/articles/story-01.webp",
      fetcher,
    });

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([9, 8]),
    );
  });

  it("rejects production URLs outside the configured CMS asset tree", async () => {
    await expect(
      articleImagePreviewResponse({
        image,
        policy,
        productionUrl: "https://internal.example.test/secret",
        fetcher: vi.fn<typeof fetch>(),
      }),
    ).rejects.toThrow(/configured CMS asset tree/);
  });
});
