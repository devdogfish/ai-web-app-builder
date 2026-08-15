import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_ONLY_PROMPT,
  hasRefinementInput,
  resolveRefinementPrompt,
} from "../core/refinement-request";

describe("refinement request", () => {
  it("allows attachments without visible prompt text", () => {
    expect(hasRefinementInput("", ["upload-1"])).toBe(true);
    expect(resolveRefinementPrompt("", ["upload-1"])).toBe(
      ATTACHMENT_ONLY_PROMPT,
    );
  });

  it("still rejects a completely empty request", () => {
    expect(hasRefinementInput("   ", [])).toBe(false);
  });

  it("preserves an explicit prompt", () => {
    expect(hasRefinementInput("Use this source", ["upload-1"])).toBe(true);
    expect(resolveRefinementPrompt(" Use this source ", ["upload-1"])).toBe(
      "Use this source",
    );
  });
});
