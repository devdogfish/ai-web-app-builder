import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COLLAPSED_CONVERSATION_WIDTH,
  constrainConversationWidth,
  MAX_CONVERSATION_WIDTH,
  MIN_CONVERSATION_WIDTH,
} from "../components/builder-pane-resize";

const css = readFileSync(
  new URL("../../../app/globals.css", import.meta.url),
  "utf8",
);

describe("builder pane resizing", () => {
  it("collapses the conversation pane after crossing its minimum width", () => {
    expect(constrainConversationWidth(MIN_CONVERSATION_WIDTH)).toBe(
      MIN_CONVERSATION_WIDTH,
    );
    expect(constrainConversationWidth(MIN_CONVERSATION_WIDTH - 0.01)).toBe(
      COLLAPSED_CONVERSATION_WIDTH,
    );
  });

  it("still caps expansion at the maximum width", () => {
    expect(constrainConversationWidth(MAX_CONVERSATION_WIDTH + 1)).toBe(
      MAX_CONVERSATION_WIDTH,
    );
  });

  it("allows the conversation grid track to reach zero", () => {
    expect(css).toMatch(
      /grid-template-columns:\s*minmax\(0, var\(--builder-conversation-width, 50%\)\)/,
    );
  });
});
