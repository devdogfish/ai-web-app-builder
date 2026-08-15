import { describe, expect, it } from "vitest";

import {
  assistantTurnStatusLabel,
  formatTurnDuration,
  toggleVersionDiff,
} from "../core/conversation-turn";

describe("conversation turn presentation", () => {
  it("toggles an already-selected Version diff off", () => {
    expect(toggleVersionDiff(null, "v2")).toBe("v2");
    expect(toggleVersionDiff("v2", "v2")).toBeNull();
    expect(toggleVersionDiff("v2", "v3")).toBe("v3");
  });

  it.each([
    [0, "a moment"],
    [31_000, "31s"],
    [60_000, "1m"],
    [91_000, "1m 31s"],
  ])("formats %dms as %s", (durationMs, expected) => {
    expect(formatTurnDuration(durationMs)).toBe(expected);
  });

  it("makes completion, cancellation, and failure durations explicit", () => {
    expect(assistantTurnStatusLabel("complete", 31_000)).toBe("Worked for 31s");
    expect(assistantTurnStatusLabel("stopped", 8_000)).toBe("Stopped after 8s");
    expect(assistantTurnStatusLabel("failed", null)).toBe("Failed");
  });
});
