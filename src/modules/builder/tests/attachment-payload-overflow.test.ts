import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/attachment-viewer.tsx", import.meta.url),
  "utf8",
);

describe("attachment payload overflow", () => {
  it("allows the payload editor to shrink inside both attachment layouts", () => {
    expect(source).toMatch(/<Tabs[\s\S]*?className="min-h-0 min-w-0 gap-0"/);
    expect(source).toMatch(
      /<TabsContent[\s\S]*?value="payload"[\s\S]*?className="min-h-0 min-w-0 overflow-hidden"/,
    );
    expect(source).toContain(
      'className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]"',
    );
  });
});
