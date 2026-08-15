import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ComponentSchema } from "../contracts";
import { ComponentDataForm } from "../ui/component-data-form";

const imageOptions = [
  {
    id: "image-1",
    label: "Story image",
    productionPath: "/media/story.webp",
    previewUrl: "/api/articles/article-1/images/image-1",
  },
] as const;

describe("ComponentDataForm image fields", () => {
  it("lets an optional stale image value be cleared", () => {
    const schema: ComponentSchema = {
      type: "object",
      properties: { hero: { type: "image" } },
    };

    const html = renderToStaticMarkup(
      <ComponentDataForm
        schema={schema}
        value={{ hero: "/media/removed.webp" }}
        imageOptions={[]}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Clear image");
    expect(html).toContain("This image is not attached to the Article");
  });

  it("renders image controls recursively inside nested arrays", () => {
    const schema: ComponentSchema = {
      type: "object",
      properties: {
        galleries: {
          type: "array",
          items: { type: "array", items: { type: "image" } },
        },
      },
    };

    const html = renderToStaticMarkup(
      <ComponentDataForm
        schema={schema}
        value={{ galleries: [["/media/story.webp"]] }}
        imageOptions={imageOptions}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Story image");
    expect(html).not.toContain("Edit this repeatable list as JSON");
  });
});
