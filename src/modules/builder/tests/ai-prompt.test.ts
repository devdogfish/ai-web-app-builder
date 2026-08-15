import { describe, expect, it } from "vitest";

import { buildArticleMessages, normalizeArticleModelOutput } from "../ai";

describe("buildArticleMessages", () => {
  it("includes every turn selected by the context planner", () => {
    const turns = Array.from({ length: 10 }, (_, index) => ({
      role: "user" as const,
      content: `turn-${index}`,
    }));
    const messages = buildArticleMessages({
      currentArticleHtml: "<article>Current, not an old version</article>",
      currentPrompt: "Refine it",
      recentRelevantTurns: turns,
      selectedUploadExtracts: [
        { id: "selected", name: "selected.md", text: "selected extract" },
      ],
    });
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain("turn-0");
    expect(serialized).toContain("turn-9");
    expect(serialized).toContain("selected extract");
    expect(serialized).toContain("Current, not an old version");
  });

  it("derives fixed website context from the website", () => {
    const messages = buildArticleMessages({
      currentArticleHtml: "<p>Article</p>",
      currentPrompt: "Add image",
      environmentContext: {
        website: "rbccm",
        articleId: "story-9",
        articleTitle: "Story Nine",
        articleSlug: "story-nine",
      },
    });

    expect(messages.at(-1)?.content).toContain(
      "Asset base path: /media/articles",
    );
    expect(messages.at(-1)?.content).toContain(
      "Preferred image extension: webp",
    );
    expect(messages[0]?.content).toContain('style="max-width: 100%;"');
  });

  it("places selected image references after the inert text context", () => {
    const messages = buildArticleMessages({
      currentArticleHtml: "<p>Article</p>",
      currentPrompt: "Match this mockup",
      selectedUploadExtracts: [
        {
          id: "mockup",
          name: "mockup.png",
          mediaType: "image/png",
          text: "Expected Asset Path: /media/story-01.webp",
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
      ],
    });

    expect(messages.at(-1)?.content).toEqual([
      expect.objectContaining({ type: "text" }),
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,aGVsbG8=", detail: "low" },
      },
    ]);
  });
});

describe("normalizeArticleModelOutput", () => {
  it("accepts an article-scoped answer without Article HTML", () => {
    expect(
      normalizeArticleModelOutput(
        'BUILDER_RESPONSE_V1\n{"action":"answer","response":"  The introduction establishes the main argument.  "}',
        "test-provider",
      ),
    ).toEqual({
      action: "answer",
      response: "The introduction establishes the main argument.",
    });
  });

  it("accepts an edit with a conversational response and complete HTML", () => {
    expect(
      normalizeArticleModelOutput(
        'BUILDER_RESPONSE_V1\n{"action":"edit","summary":"Clarify article introduction","response":"I clarified the introduction and shortened two sentences."}\nBUILDER_ARTICLE_HTML_V1\n<article>Updated</article>',
        "test-provider",
      ),
    ).toEqual({
      action: "edit",
      summary: "Clarify article introduction",
      response: "I clarified the introduction and shortened two sentences.",
      articleHtml: "<article>Updated</article>",
    });
  });

  it("falls back safely when an edit summary is not two to four words", () => {
    expect(
      normalizeArticleModelOutput(
        'BUILDER_RESPONSE_V1\n{"action":"edit","summary":"Copied far too many words directly from the user request","response":"I removed the wrappers."}\nBUILDER_ARTICLE_HTML_V1\n<section>Updated</section>',
        "test-provider",
      ),
    ).toMatchObject({ action: "edit", summary: "Article update" });
  });

  it.each([
    'BUILDER_RESPONSE_V1\n{"action":"answer","response":"Answered."}\nBUILDER_ARTICLE_HTML_V1\n<p>Unexpected</p>',
    'BUILDER_RESPONSE_V1\n{"action":"edit","summary":"Change article","response":"Changed it."}',
    'BUILDER_RESPONSE_V1\n{"action":"other","response":"Nope."}',
    "<article>Protocol missing</article>",
  ])("rejects an invalid action/HTML combination", (output) => {
    expect(() =>
      normalizeArticleModelOutput(output, "test-provider"),
    ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
  });
});
