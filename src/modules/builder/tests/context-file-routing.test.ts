import { describe, expect, it } from "vitest";

import {
  isContextImageFile,
  partitionContextFiles,
} from "../core/context-file-routing";

describe("context file routing", () => {
  it("routes every browser image MIME type to Article Images", () => {
    expect(
      isContextImageFile({
        name: "camera-export.unknown",
        type: "image/x-raw",
      }),
    ).toBe(true);
  });

  it("recognizes common image extensions when the browser omits MIME type", () => {
    expect(isContextImageFile({ name: "photo.HEIC", type: "" })).toBe(true);
    expect(isContextImageFile({ name: "notes.md", type: "" })).toBe(false);
  });

  it("keeps images out of chat reference attachments in a mixed selection", () => {
    const photo = { name: "hero.webp", type: "image/webp" };
    const document = { name: "brief.pdf", type: "application/pdf" };

    expect(partitionContextFiles([photo, document])).toEqual({
      images: [photo],
      references: [document],
    });
  });
});
