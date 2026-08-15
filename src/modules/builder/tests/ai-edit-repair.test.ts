import { describe, expect, it, vi } from "vitest";

import {
  buildArticleEditRepairPrompt,
  prepareArticleModelEdit,
} from "../ai/edit-repair";

const initialEdit = {
  action: "edit" as const,
  summary: "Convert quotes",
  response: "Converted both quotes.",
  articleHtml: "<p><SimpleQuote data={} /></p>",
};

describe("AI edit repair", () => {
  it("retries a rejected edit with validation feedback", async () => {
    const prepare = vi
      .fn<(source: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Component data must use data={{...}}"))
      .mockResolvedValueOnce("prepared");
    const repair = vi.fn(async () => ({
      ...initialEdit,
      articleHtml:
        '<SimpleQuote data={{ quote: "Quote", attribution: "Source" }} />',
    }));

    const result = await prepareArticleModelEdit(initialEdit, {
      prepare,
      repair,
    });

    expect(result.prepared).toBe("prepared");
    expect(result.result.articleHtml).toContain("data={{");
    expect(repair).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        error: expect.objectContaining({
          message: "Component data must use data={{...}}",
        }),
      }),
    );
  });

  it("stops after two repair attempts and exposes the final validation error", async () => {
    const finalError = new Error("Still invalid");
    const prepare = vi
      .fn<(source: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Invalid one"))
      .mockRejectedValueOnce(new Error("Invalid two"))
      .mockRejectedValueOnce(finalError);
    const repair = vi.fn(async () => initialEdit);

    await expect(
      prepareArticleModelEdit(initialEdit, { prepare, repair }),
    ).rejects.toBe(finalError);
    expect(repair).toHaveBeenCalledTimes(2);
  });

  it("gives the model concrete Component syntax and placement rules", () => {
    const prompt = buildArticleEditRepairPrompt(
      "Convert both quotes.",
      new Error("Unexpected closing tag p"),
    );

    expect(prompt).toContain("Unexpected closing tag p");
    expect(prompt).toContain('data={{ quote: "…", attribution: "…" }}');
    expect(prompt).toContain("must not be wrapped in <p>");
  });
});
