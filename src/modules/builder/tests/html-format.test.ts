import { describe, expect, it } from "vitest";

import { formatHtmlSource } from "../content/format-html";

describe("HTML source formatting", () => {
  it("wraps content without splitting inline tag delimiters", async () => {
    const source =
      "<p><strong>European leaders are sounding the alarm as natural gas storage falls to crisis levels ahead of winter.</strong> European natural gas storage stands at 54% full compared to 64% at this time in 2022 during the prior energy crisis.</p>";

    await expect(formatHtmlSource(source)).resolves.toBe(`<p>
  <strong>
    European leaders are sounding the alarm as natural gas storage falls to
    crisis levels ahead of winter.
  </strong>
  European natural gas storage stands at 54% full compared to 64% at this time
  in 2022 during the prior energy crisis.
</p>
`);
  });

  it("keeps nested anchor tags intact", async () => {
    const source =
      '<article><nav><p><a href="#strategic-targeting">Strategic targeting of cloud infrastructures</a></p></nav></article>';

    await expect(formatHtmlSource(source)).resolves.toBe(`<article>
  <nav>
    <p>
      <a href="#strategic-targeting">
        Strategic targeting of cloud infrastructures
      </a>
    </p>
  </nav>
</article>
`);
  });
});
