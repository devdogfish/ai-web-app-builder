import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/conversation-panel.tsx", import.meta.url),
  "utf8",
);

describe("conversation timestamp ownership", () => {
  it("labels user and assistant timestamps with their message owner", () => {
    expect(source).toContain("User message sent ${relativeTime}");
    expect(source).toContain(
      'role === "assistant" ? "Assistant response" : "Event"',
    );
  });
});
