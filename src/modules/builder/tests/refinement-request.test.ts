import { describe, expect, it } from "vitest";

import {
  hasRefinementInput,
  resolveRefinementPrompt,
} from "../core/refinement-request";

describe("refinement request", () => {
  it("allows attachments without visible prompt text", () => {
    expect(hasRefinementInput("", ["upload-1"])).toBe(true);
    expect(resolveRefinementPrompt("")).toBe("");
  });

  it("still rejects a completely empty request", () => {
    expect(hasRefinementInput("   ", [])).toBe(false);
  });

  it("preserves an explicit prompt", () => {
    expect(hasRefinementInput("Use this source", ["upload-1"])).toBe(true);
    expect(resolveRefinementPrompt(" Use this source ")).toBe(
      "Use this source",
    );
  });
});
