import { describe, expect, it } from "vitest";

import { createArticleRepository } from "../db";

describe("assistant message timings", () => {
  it("persists and serializes measured work and thinking durations", () => {
    const repository = createArticleRepository({ filename: ":memory:" });
    const baseline = repository.bootstrapArticle({
      article: {
        id: "article-1",
        website: "rbccm",
        articleType: "story",
        title: "Article",
      },
      html: "<article><p>Current</p></article>",
    });

    repository.commitAssistantAnswer({
      articleId: "article-1",
      expectedChatId: baseline.chat.id,
      expectedVersionId: baseline.currentVersion.id,
      expectedVersionSha256: baseline.currentVersion.sha256,
      response: "Done.",
      durationMs: 31_000,
      thinkingMs: 3_000,
    });

    const workspace = repository.getWorkspace("article-1");

    expect(workspace?.messages.at(-1)).toMatchObject({
      role: "assistant",
      durationMs: 31_000,
      thinkingMs: 3_000,
    });
    repository.close();
  });
});
