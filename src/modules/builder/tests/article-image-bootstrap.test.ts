import { describe, expect, it } from "vitest";

import { ArticleImageRepository } from "../../article-images/repository";
import { createArticleRepository } from "../db";

describe("Article image bootstrap transaction", () => {
  it("persists the baseline and its converted images together", () => {
    const repository = createArticleRepository({ filename: ":memory:" });
    const images = new ArticleImageRepository(repository.sqlite, {
      createId: () => "image-1",
    });

    repository.sqlite.transaction(() => {
      repository.bootstrapArticle({
        article: {
          id: "article-1",
          website: "website-1",
          articleType: "article-type-1",
        },
        html: '<p>Copy</p><img src="/media/articles/story-01.webp">',
      });
      images.add("article-1", [
        {
          name: "source.png",
          mediaType: "image/webp",
          bytes: new Uint8Array([1, 2, 3]),
        },
      ]);
    })();

    expect(repository.getWorkspace("article-1")?.currentVersion.html).toContain(
      "story-01.webp",
    );
    expect(images.getBinary("article-1", "image-1")).toMatchObject({
      mediaType: "image/webp",
      needsUpload: true,
    });
    repository.close();
  });

  it("rolls back the baseline when image persistence fails", () => {
    const repository = createArticleRepository({ filename: ":memory:" });
    const images = new ArticleImageRepository(repository.sqlite);

    expect(() =>
      repository.sqlite.transaction(() => {
        repository.bootstrapArticle({
          article: {
            id: "article-1",
            website: "website-1",
            articleType: "article-type-1",
          },
          html: "<p>Copy</p>",
        });
        images.add("article-1", [
          {
            name: "broken.png",
            mediaType: "image/png",
            bytes: new Uint8Array(),
          },
        ]);
      })(),
    ).toThrow(/empty or has an invalid size/);
    expect(repository.getWorkspace("article-1")).toBeNull();
    repository.close();
  });
});
