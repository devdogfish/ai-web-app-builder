import { describe, expect, it } from "vitest";

import { diagnoseComponentSource } from "../diagnostics";

const validSource = `type Props = {
  title: string;
  image: ImageSource;
  content: React.ReactNode;
};

export default function Card({ title, image, content }: Props) {
  return <article><img src={image} alt="" /><h2>{title}</h2>{content}</article>;
}`;

describe("Component Source diagnostics", () => {
  it("accepts supported React and ImageSource types", () => {
    expect(diagnoseComponentSource(validSource)).toEqual([]);
  });

  it("returns positioned TypeScript errors", () => {
    const source = validSource.replace("title: string", "title: MissingType");
    const diagnostics = diagnoseComponentSource(source);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("MissingType"),
        }),
      ]),
    );
    expect(diagnostics[0]!.to).toBeGreaterThan(diagnostics[0]!.from);
  });

  it("returns Builder-specific authoring errors", () => {
    const diagnostics = diagnoseComponentSource(
      `import React from "react";\n${validSource}`,
    );
    expect(
      diagnostics.some((item) =>
        item.message.includes("imports are not allowed"),
      ),
    ).toBe(true);
  });
});
