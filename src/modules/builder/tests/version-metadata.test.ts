import { describe, expect, it } from "vitest";

import { countVersionDiffLines } from "../core/version-diff";
import {
  normalizeVersionSummary,
  resolveVersionSummary,
  revertedVersionSummary,
} from "../core/version-summary";

describe("version metadata", () => {
  it.each([
    ["Remove structural wrappers", "Remove structural wrappers"],
    ["Simplify nested article structure", "Simplify nested article structure"],
    ["Please fix the camera shake timing", "Article update"],
    ["CSS", "Article update"],
    ["", "Article update"],
    ["Reverted v2", "Reverted v2"],
  ])("normalizes %j to a two-to-four-word summary", (input, expected) => {
    const summary = normalizeVersionSummary(input);
    expect(summary).toBe(expected);
    expect([2, 3, 4]).toContain(summary.split(" ").length);
  });

  it("names restores after their source version, including legacy records", () => {
    const versions = [
      { id: "v2", number: 2 },
      { id: "v5", number: 5 },
    ];

    expect(revertedVersionSummary(2)).toBe("Reverted v2");
    expect(
      resolveVersionSummary(
        {
          id: "v5",
          number: 5,
          source: "rewind",
          restoredFromVersionId: "v2",
          summary: "Restored version",
        },
        versions,
      ),
    ).toBe("Reverted v2");
  });

  it("counts added, removed, and replaced lines", () => {
    expect(countVersionDiffLines("one\ntwo", "one\ntwo\nthree")).toEqual({
      additions: 1,
      deletions: 0,
    });
    expect(countVersionDiffLines("one\ntwo\nthree", "one\nthree")).toEqual({
      additions: 0,
      deletions: 1,
    });
    expect(countVersionDiffLines("one\ntwo", "one\nchanged")).toEqual({
      additions: 1,
      deletions: 1,
    });
    expect(countVersionDiffLines("same", "same")).toEqual({
      additions: 0,
      deletions: 0,
    });
    expect(countVersionDiffLines("", "first line")).toEqual({
      additions: 1,
      deletions: 0,
    });
  });
});
