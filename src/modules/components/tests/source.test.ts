import { describe, expect, it } from "vitest";

import { BUILTIN_COMPONENTS } from "../builtins";
import {
  compileArticleSource,
  createComponentReference,
  detachComponentReference,
  materializeComponentType,
  renderComponentHtml,
  validateArticleSourceComponents,
} from "../compiler";
import type { ComponentDefinition } from "../contracts";
import {
  componentReferenceDisplay,
  formatArticleSource,
  maskComponentReferences,
} from "../format";
import {
  ComponentSourceSyntaxError,
  MAX_ARTICLE_SOURCE_BYTES,
  MAX_COMPONENT_SOURCE_ARRAY_ITEMS,
  MAX_COMPONENT_SOURCE_VALUE_DEPTH,
  isHtmlLiteral,
  parseArticleSource,
  serializeComponentReference,
  unwrapComponentSourceData,
} from "../source";

const date = new Date(1_700_000_000_000);
const definitions = new Map(
  BUILTIN_COMPONENTS.map((input) => [
    input.type,
    {
      ...input,
      uiHints: input.uiHints ?? {},
      defaultData: input.defaultData ?? {},
      sampleData: input.sampleData ?? {},
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
    } as ComponentDefinition,
  ]),
);

const tabsSource = `<p>Before</p>
<Component type="tabs" data={{
  tabs: [
    { label: "Overview", content: html\`<p title="Normal attribute">A & B</p>\` },
    { label: "Details", content: html\`<a href='/details'>Details</a>\` },
  ],
}} />
<p>After</p>`;

describe("Article Source Component references", () => {
  it("parses restricted data with rich HTML literals and exact offsets", () => {
    const parsed = parseArticleSource(tabsSource);

    expect(parsed.references).toHaveLength(1);
    const [reference] = parsed.references;
    expect(reference.type).toBe("tabs");
    expect(reference.raw).toBe(tabsSource.slice(reference.start, reference.end));
    const firstContent = reference.data.tabs;
    expect(Array.isArray(firstContent)).toBe(true);
    const literal = (firstContent as Array<Record<string, unknown>>)[0]?.content;
    expect(isHtmlLiteral(literal)).toBe(true);
    expect(unwrapComponentSourceData(reference.data)).toMatchObject({
      tabs: [
        { label: "Overview", content: '<p title="Normal attribute">A & B</p>' },
        { label: "Details", content: "<a href='/details'>Details</a>" },
      ],
    });
  });

  it("does not recognize reference-looking strings in comments, scripts, or styles", () => {
    const source = `<!-- <Component type="bad" data={{}} /> -->
<script>const sample = '<Component type="bad" data={{}} />';</script>
<style>/* <Component type="bad" data={{}} /> */</style>
<Component type="tabs" data={{ tabs: [{ label: "A", content: html\`<p>A</p>\` }] }} />`;

    expect(parseArticleSource(source).references.map((item) => item.type)).toEqual(["tabs"]);
  });

  it.each([
    '<Component type="tabs" data={{ tabs: makeTabs() }} />',
    '<Component type="tabs" data={{ tabs: [{ label: window.name }] }} />',
    '<Component type="tabs" data={{}} onClick="bad" />',
    '<Component type="tabs" />',
    '<Component data={{}} />',
    '<Component type="tabs" data={{ value: undefined }} />',
  ])("rejects non-data syntax: %s", (source) => {
    expect(() => parseArticleSource(source)).toThrow(ComponentSourceSyntaxError);
  });

  it("bounds Article Source size and restricted-data complexity", () => {
    expect(() => parseArticleSource("x".repeat(MAX_ARTICLE_SOURCE_BYTES + 1))).toThrow(
      /byte limit/,
    );

    const nested = "[".repeat(MAX_COMPONENT_SOURCE_VALUE_DEPTH + 1);
    const unnested = "]".repeat(MAX_COMPONENT_SOURCE_VALUE_DEPTH + 1);
    expect(() =>
      parseArticleSource(
        `<Component type="tabs" data={{ value: ${nested}0${unnested} }} />`,
      ),
    ).toThrow(/nesting limit/);

    const oversizedArray = Array(MAX_COMPONENT_SOURCE_ARRAY_ITEMS + 1)
      .fill("0")
      .join(",");
    expect(() =>
      parseArticleSource(
        `<Component type="tabs" data={{ value: [${oversizedArray}] }} />`,
      ),
    ).toThrow(/array.*at most/);
  });

  it("serializes and reparses canonical self-closing references", () => {
    const definition = definitions.get("tabs")!;
    const serialized = serializeComponentReference(
      {
        type: "tabs",
        data: {
          tabs: [{ label: "A", content: "<p data-name=\"x\">A ` tick</p>" }],
        },
      },
      definition.schema,
    );

    expect(serialized).toContain('type="tabs"');
    expect(serialized).toContain('"content": html`');
    expect(unwrapComponentSourceData(parseArticleSource(serialized).references[0]!.data)).toEqual({
      tabs: [{ label: "A", content: '<p data-name="x">A ` tick</p>' }],
    });
  });

  it("provides a schema-aware creation helper", () => {
    const definition = definitions.get("attributed-quote")!;
    const source = createComponentReference(
      "attributed-quote",
      definition.sampleData,
      definition.schema,
    );
    expect(source).toContain('"quote": html`');
    expect(parseArticleSource(source).references[0]?.type).toBe("attributed-quote");
  });

  it("shows only the atomic type in editor display text", () => {
    expect(componentReferenceDisplay({ type: "image-carousel" })).toBe(
      '<Component type="image-carousel" />',
    );
  });
});

describe("Component compilation", () => {
  it("renders built-in tabs literally between ordinary HTML", () => {
    const compiled = compileArticleSource(tabsSource, definitions);

    expect(compiled).toMatch(/^<p>Before<\/p>/);
    expect(compiled).toContain('<div class="article-tabs">');
    expect(compiled).toContain('<p title="Normal attribute">A & B</p>');
    expect(compiled).toContain("document.currentScript?.previousElementSibling");
    expect(compiled).toMatch(/<p>After<\/p>$/);
    expect(compiled).not.toContain("<Component");
  });

  it("escapes ordinary values but injects html fields raw", () => {
    const source = `<Component type="attributed-quote" data={{
      author: "<Author & Co>",
      image: "x&y.jpg",
      imageAlt: 'A "portrait"',
      quote: html\`<p><strong>Raw</strong></p>\`,
    }} />`;
    const compiled = compileArticleSource(source, definitions);
    expect(compiled).toContain("&lt;Author &amp; Co&gt;");
    expect(compiled).toContain('src="x&amp;y.jpg"');
    expect(compiled).toContain('<p><strong>Raw</strong></p>');
  });

  it("strictly rejects missing and unknown fields", () => {
    const missing = '<Component type="tabs" data={{ tabs: [] }} />';
    const unknown = `<Component type="tabs" data={{ tabs: [{ label: "A", content: html\`<p>A</p>\`, surprise: true }] }} />`;

    expect(validateArticleSourceComponents(missing, definitions)).toMatchObject({ valid: false });
    expect(validateArticleSourceComponents(unknown, definitions)).toMatchObject({ valid: false });
    expect(() => compileArticleSource(unknown, definitions)).toThrow("surprise is not allowed");
  });

  it("stops compilation when expanded Component output exceeds the limit", () => {
    expect(() =>
      compileArticleSource(tabsSource, definitions, { maxOutputBytes: 100 }),
    ).toThrowError(
      expect.objectContaining({
        code: "output_too_large",
        message: expect.stringContaining("100-byte limit"),
      }),
    );
  });

  it("bounds repeated template expansion while it is being rendered", () => {
    const amplifier: ComponentDefinition = {
      type: "amplifier",
      description: "Test",
      htmlTemplate: `{{#each items}}${"x".repeat(512)}{{/each}}`,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          items: { type: "array", items: { type: "string" } },
        },
        required: ["items"],
      },
      uiHints: {},
      defaultData: {},
      sampleData: { items: ["one"] },
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
    };

    expect(() =>
      renderComponentHtml(
        amplifier,
        { items: Array.from({ length: 1_000 }, () => "item") },
        { maxOutputBytes: 1_024 },
      ),
    ).toThrowError(expect.objectContaining({ code: "output_too_large" }));
  });

  it("reports unknown and deleted Components", () => {
    const unknown = '<Component type="missing" data={{}} />';
    expect(validateArticleSourceComponents(unknown, definitions).issues[0]?.code).toBe(
      "unknown_component",
    );

    const deleted = new Map(definitions);
    deleted.set("tabs", { ...definitions.get("tabs")!, deletedAt: date });
    expect(validateArticleSourceComponents(tabsSource, deleted).issues[0]?.code).toBe(
      "deleted_component",
    );
    expect(validateArticleSourceComponents(tabsSource, deleted, { allowDeleted: true }).valid).toBe(
      true,
    );
  });

  it("detaches exactly one selected reference", () => {
    const source = `${tabsSource}\n${tabsSource}`;
    const second = parseArticleSource(source).references[1]!;
    const detached = detachComponentReference(source, { start: second.start }, definitions);
    const remaining = parseArticleSource(detached).references;

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.start).toBe(tabsSource.indexOf("<Component"));
    expect(detached).toContain('<div class="article-tabs">');
  });

  it("materializes one type and leaves other managed references intact", () => {
    const quote = definitions.get("attributed-quote")!;
    const quoteSource = createComponentReference("attributed-quote", quote.sampleData, quote.schema);
    const source = `${tabsSource}\n${quoteSource}`;
    const materialized = materializeComponentType(source, "tabs", definitions.get("tabs")!);

    expect(parseArticleSource(materialized).references.map((item) => item.type)).toEqual([
      "attributed-quote",
    ]);
    expect(materialized).toContain('<div class="article-tabs">');
  });
});

describe("Article Source formatting", () => {
  it("masks directives while ordinary HTML is formatted, then restores canonical data", async () => {
    let formatterInput = "";
    const formatted = await formatArticleSource(tabsSource, (ordinaryHtml) => {
      formatterInput = ordinaryHtml;
      return ordinaryHtml.replace("<p>Before</p>", "<p>Before formatted</p>");
    });

    expect(formatterInput).not.toContain('<Component type="tabs"');
    expect(formatterInput).toContain("<!--ARTICLE_COMPONENT_REFERENCE_0-->");
    expect(formatted).toContain("<p>Before formatted</p>");
    expect(parseArticleSource(formatted).references).toHaveLength(1);
  });

  it("detects formatters that discard masked references", () => {
    const masked = maskComponentReferences(tabsSource);
    expect(() => masked.restore("<p>formatter dropped it</p>")).toThrow(
      "removed a Component placeholder",
    );
  });
});
