import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../../app/globals.css", import.meta.url),
  "utf8",
);

describe("mobile preview CSS", () => {
  it("uses a balanced phone ratio with a hairline frame", () => {
    expect(css).toMatch(
      /\.preview-stage\[data-preview-size="mobile"\] \.preview-device-slot\s*{[^}]*aspect-ratio:\s*9\s*\/\s*17\.5/,
    );
    expect(css).toContain("@container (max-aspect-ratio: 9 / 17.5)");
    expect(css).toMatch(
      /\.preview-stage\[data-preview-size="mobile"\] \.preview-device\s*{[^}]*border:\s*1px\s+solid/,
    );
    expect(css).not.toContain(".preview-device::after");
  });
});
