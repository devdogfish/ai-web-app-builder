import { describe, expect, it } from "vitest";

import { articleImagePreviewUrl } from "../core/article-image-preview-url";

describe("Article Image preview URL", () => {
  it("encodes route parameters", () => {
    expect(articleImagePreviewUrl("article/one", "image two")).toBe(
      "/api/articles/article%2Fone/images/image%20two",
    );
  });

  it("encodes the optional CMS-first production source", () => {
    expect(
      articleImagePreviewUrl(
        "article/one",
        "image two",
        "https://cms.example.test/media/articles/story one.webp",
        "version-2:2026-08-15T12:00:00.000Z",
      ),
    ).toBe(
      "/api/articles/article%2Fone/images/image%20two?production=https%3A%2F%2Fcms.example.test%2Fmedia%2Farticles%2Fstory+one.webp&revision=version-2%3A2026-08-15T12%3A00%3A00.000Z",
    );
  });
});
