import { describe, expect, it } from "vitest";

import { formatHtmlSource } from "../content/format-html";

describe("HTML source formatting", () => {
  it("matches the effective VS Code Prettier defaults", async () => {
    const source =
      "<p><strong>European leaders are sounding the alarm as natural gas storage falls to crisis levels ahead of winter.</strong> European natural gas storage stands at 54% full compared to 64% at this time in 2022 during the prior energy crisis.</p>";

    await expect(formatHtmlSource(source)).resolves.toBe(`<p>
  <strong
    >European leaders are sounding the alarm as natural gas storage falls to
    crisis levels ahead of winter.</strong
  >
  European natural gas storage stands at 54% full compared to 64% at this time
  in 2022 during the prior energy crisis.
</p>
`);
  });
});
