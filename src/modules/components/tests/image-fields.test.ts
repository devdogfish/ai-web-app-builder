import { describe, expect, it } from "vitest";

import type { ComponentSchema } from "../contracts";
import {
  componentImageValues,
  unavailableComponentImageValues,
} from "../image-fields";

const schema: ComponentSchema = {
  type: "object",
  properties: {
    portrait: { type: "image" },
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          src: { type: "image" },
          alt: { type: "string" },
        },
      },
    },
  },
};

describe("Component image fields", () => {
  it("finds populated image values through nested arrays", () => {
    expect(
      componentImageValues(schema, {
        portrait: "/media/story-01.webp",
        slides: [
          { src: "/media/story-02.webp", alt: "Second" },
          { src: "", alt: "Empty" },
        ],
      }),
    ).toEqual([
      { path: "data.portrait", source: "/media/story-01.webp" },
      { path: "data.slides[0].src", source: "/media/story-02.webp" },
    ]);
  });

  it("reports paths that are not current Article Images", () => {
    expect(
      unavailableComponentImageValues(
        schema,
        {
          portrait: "/media/story-01.webp",
          slides: [{ src: "/manual/wrong-name.jpg", alt: "Wrong" }],
        },
        new Set(["/media/story-01.webp"]),
      ),
    ).toEqual([
      { path: "data.slides[0].src", source: "/manual/wrong-name.jpg" },
    ]);
  });
});
