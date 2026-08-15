import { describe, expect, it } from "vitest";

import type { ComponentDefinition } from "../../components/contracts";
import {
  assertValidManagedArticleSource,
  compileManagedArticleSource,
  formatManagedArticleSource,
} from "../content";

const tabs: ComponentDefinition = {
  type: "tabs",
  description: "Tabs",
  htmlTemplate:
    '<div class="tabs">{{#each tabs}}<section><h2>{{label}}</h2>{{{content}}}</section>{{/each}}</div>',
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      tabs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            content: { type: "html" },
          },
          required: ["label", "content"],
        },
      },
    },
    required: ["tabs"],
  },
  uiHints: {},
  defaultData: {},
  sampleData: { tabs: [{ label: "One", content: "<p>Body</p>" }] },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};
const lookup = new Map([[tabs.type, tabs]]);

describe("managed Article Source", () => {
  it("formats surrounding HTML while preserving canonical Component data", async () => {
    const source =
      '<article><p>Intro</p><Component type="tabs" data={{tabs:[{label:"One",content:html`<a title="Example">Body</a>`}]}} /></article>';

    const formatted = await formatManagedArticleSource(source, lookup);

    expect(formatted).toContain("<article>");
    expect(formatted).toContain('<Component type="tabs"');
    expect(formatted).toContain(
      '"content": html`<a title="Example">Body</a>`',
    );
    assertValidManagedArticleSource(formatted, lookup);
  });

  it("compiles managed references to plain formatted HTML", async () => {
    const source =
      '<p>Intro</p><Component type="tabs" data={{ tabs: [{ label: "One", content: html`<p>Body</p>` }] }} />';

    const compiled = await compileManagedArticleSource(source, lookup);

    expect(compiled).toContain('<div class="tabs">');
    expect(compiled).toContain("<h2>One</h2>");
    expect(compiled).toContain("<p>Body</p>");
    expect(compiled).not.toContain("<Component");
  });

  it("blocks unknown or invalid Component references", () => {
    expect(() =>
      assertValidManagedArticleSource(
        '<Component type="missing" data={{}} />',
        lookup,
      ),
    ).toThrow("Unknown Component type missing");
    expect(() =>
      assertValidManagedArticleSource(
        '<Component type="tabs" data={{ tabs: [{ label: "One" }] }} />',
        lookup,
      ),
    ).toThrow("content is required");
  });

  it("allows data edits but blocks implicit detachment", () => {
    const previous =
      '<Component type="tabs" data={{ tabs: [{ label: "One", content: html`<p>Before</p>` }] }} />';
    const updated =
      '<Component type="tabs" data={{ tabs: [{ label: "One", content: html`<p>After</p>` }] }} />';
    expect(() =>
      assertValidManagedArticleSource(updated, lookup, {
        previousSource: previous,
      }),
    ).not.toThrow();
    expect(() =>
      assertValidManagedArticleSource("<p>Detached</p>", lookup, {
        previousSource: previous,
      }),
    ).toThrow("confirmed Detach action");
  });
});
