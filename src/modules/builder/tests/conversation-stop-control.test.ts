import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/conversation-panel.tsx", import.meta.url),
  "utf8",
);

describe("conversation stop control", () => {
  it("replaces the send control with an enabled stop button while generating", () => {
    expect(source).toContain('aria-label="Stop generation"');
    expect(source).toContain("onClick={onStop}");
    expect(source).not.toMatch(
      /aria-label="Stop generation"[\s\S]{0,120}\bdisabled\b/,
    );
  });

  it("keeps the prompt editable during generation", () => {
    const promptInput = source.match(/<InputGroupTextarea[\s\S]*?\/>/)?.[0];
    expect(promptInput).toBeDefined();
    expect(promptInput).not.toContain("disabled={generating}");
  });
});
