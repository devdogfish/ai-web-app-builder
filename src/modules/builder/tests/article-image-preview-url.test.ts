import { describe, expect, it } from "vitest";

import { articleImagePreviewUrl } from "../core/article-image-preview-url";

describe("Article Image preview URL", () => {
  it("encodes route parameters", () => {
    expect(articleImagePreviewUrl("article/one", "image two")).toBe(
      "/api/articles/article%2Fone/images/image%20two",
    );
  });
});
