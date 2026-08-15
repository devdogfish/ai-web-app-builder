import { describe, expect, it } from "vitest";

import { BUILDER_CONTEXT_LIMITS } from "../config/builder";
import {
  compactConversationMemory,
  compactedConversationBoundary,
} from "../content";

describe("compactConversationMemory", () => {
  it("keeps bounded structured excerpts and carries prior memory", () => {
    const first = compactConversationMemory(null, [
      { id: "one", role: "user", text: "Remember   the launch date" },
    ]);
    const next = compactConversationMemory(first, [
      { id: "two", role: "assistant", text: "x".repeat(10_000) },
    ]);

    expect(next).toContain("launch date");
    expect(next).toContain('\"id\":\"two\"');
    expect(next!.length).toBeLessThanOrEqual(
      BUILDER_CONTEXT_LIMITS.maxCompactMemoryCharacters,
    );
    expect(compactedConversationBoundary(next)).toBe("two");
  });
});
