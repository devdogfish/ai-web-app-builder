import { describe, expect, it } from "vitest";

import { prepareComponentDefinition } from "../authoring";
import { BUILTIN_COMPONENTS } from "../builtins";
import {
  compileArticleSource,
  createComponentReference,
  detachComponentReference,
  materializeComponentId,
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
  displayComponentTagReferences,
  parseArticleSource,
  resolveComponentTagReferences,
  serializeComponentReference,
  unwrapComponentSourceData,
} from "../source";

const date = new Date(1_700_000_000_000);
const definitions = new Map<string, ComponentDefinition>(
  BUILTIN_COMPONENTS.map((input) => {
    const prepared = prepareComponentDefinition(input);
    const id = prepared.tag
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase();
    return [
      id,
      {
        ...prepared,
        id,
        createdAt: date,
        updatedAt: date,
        deletedAt: null,
      } satisfies ComponentDefinition,
    ];
  }),
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
    expect(reference.id).toBe("tabs");
    expect(reference.raw).toBe(
      tabsSource.slice(reference.start, reference.end),
    );
    const firstContent = reference.data.tabs;
    expect(Array.isArray(firstContent)).toBe(true);
    const literal = (firstContent as Array<Record<string, unknown>>)[0]
      ?.content;
    expect(isHtmlLiteral(literal)).toBe(true);
    expect(unwrapComponentSourceData(reference.data)).toMatchObject({
      tabs: [
        { label: "Overview", content: '<p title="Normal attribute">A & B</p>' },
        { label: "Details", content: "<a href='/details'>Details</a>" },
      ],
    });
  });

  it("ignores reference-looking strings in comments, scripts, and styles", () => {
    const source = `<!-- <Component type="bad" data={{}} /> -->
<script>const sample = '<Component type="bad" data={{}} />';</script>
<style>/* <Component type="bad" data={{}} /> */</style>
<Component type="tabs" data={{ tabs: [{ label: "A", content: html\`<p>A</p>\` }] }} />`;
    expect(
      parseArticleSource(source).references.map((item) => item.id),
    ).toEqual(["tabs"]);
  });

  it.each([
    '<Component type="tabs" data={{ tabs: makeTabs() }} />',
    '<Component type="tabs" data={{ tabs: [{ label: window.name }] }} />',
    '<Component type="tabs" data={{}} onClick="bad" />',
    '<Component type="tabs" />',
    "<Component data={{}} />",
    '<Component type="tabs" data={{ value: undefined }} />',
  ])("rejects non-data syntax: %s", (source) => {
    expect(() => parseArticleSource(source)).toThrow(
      ComponentSourceSyntaxError,
    );
  });

  it("bounds Article Source size and restricted-data complexity", () => {
    expect(() =>
      parseArticleSource("x".repeat(MAX_ARTICLE_SOURCE_BYTES + 1)),
    ).toThrow(/byte limit/);
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
        id: "tabs",
        data: {
          tabs: [{ label: "A", content: '<p data-name="x">A ` tick</p>' }],
        },
      },
      definition.schema,
    );
    expect(serialized).toContain('id="tabs"');
    expect(serialized).toContain('"content": html`');
    expect(
      unwrapComponentSourceData(
        parseArticleSource(serialized).references[0]!.data,
      ),
    ).toEqual({
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
    expect(parseArticleSource(source).references[0]?.id).toBe(
      "attributed-quote",
    );
  });

  it("shows the Component Tag without an import or type attribute", () => {
    expect(componentReferenceDisplay("ImageCarousel")).toBe(
      "<ImageCarousel />",
    );
  });

  it("resolves visible tags to stable IDs and displays renamed tags", () => {
    const visible = `<Tabs data={{ tabs: [] }} />`;
    const internal = resolveComponentTagReferences(visible, (tag) => {
      const definition = [...definitions.values()].find(
        (candidate) => candidate.tag === tag,
      );
      return definition;
    });
    expect(internal).toBe(
      '<Component id="tabs" data={{}} />'.replace(
        "data={{}}",
        'data={{\n  "tabs": []\n}}',
      ),
    );

    const displayed = displayComponentTagReferences(internal, (id) => {
      const definition = definitions.get(id);
      return definition ? { ...definition, tag: "SimpleTabs" } : null;
    });
    expect(displayed).toContain("<SimpleTabs data={{");
    expect(displayed).not.toContain("id=");
    expect(displayed).not.toContain("type=");

    expect(
      resolveComponentTagReferences("<Tabs />", (tag) =>
        [...definitions.values()].find((candidate) => candidate.tag === tag),
      ),
    ).toBe('<Component id="tabs" data={{}} />');
  });
});

describe("Component compilation", () => {
  it("renders built-in tabs literally between ordinary HTML", async () => {
    const compiled = await compileArticleSource(tabsSource, definitions);
    expect(compiled).toMatch(/^<p>Before<\/p>/);
    expect(compiled).toContain('<div class="article-tabs">');
    expect(compiled).toContain('<p title="Normal attribute">A & B</p>');
    expect(compiled).toContain(
      "document.currentScript?.previousElementSibling",
    );
    expect(compiled).toMatch(/<p>After<\/p>$/);
    expect(compiled).not.toContain("<Component");
  });

  it("escapes scalar values but injects ReactNode fields raw", async () => {
    const source = `<Component type="attributed-quote" data={{
      author: "<Author & Co>",
      image: "x&y.jpg",
      imageAlt: 'A "portrait"',
      quote: html\`<p><strong>Raw</strong></p>\`,
    }} />`;
    const compiled = await compileArticleSource(source, definitions);
    expect(compiled).toContain("&lt;Author &amp; Co&gt;");
    expect(compiled).toContain('src="x&amp;y.jpg"');
    expect(compiled).toContain("<p><strong>Raw</strong></p>");
  });

  it("uses defaults for omitted props and rejects unknown fields", async () => {
    const withDefaults = '<Component type="tabs" data={{}} />';
    const unknown = `<Component type="tabs" data={{ tabs: [{ label: "A", content: html\`<p>A</p>\`, surprise: true }] }} />`;
    expect(
      (await validateArticleSourceComponents(withDefaults, definitions)).valid,
    ).toBe(true);
    expect(
      (await validateArticleSourceComponents(unknown, definitions)).valid,
    ).toBe(false);
    await expect(compileArticleSource(unknown, definitions)).rejects.toThrow(
      "surprise is not allowed",
    );
  });

  it("stops compilation when expanded output exceeds the limit", async () => {
    await expect(
      compileArticleSource(tabsSource, definitions, { maxOutputBytes: 100 }),
    ).rejects.toMatchObject({
      code: "output_too_large",
      message: expect.stringContaining("100-byte limit"),
    });
  });

  it("bounds repeated TSX expansion", async () => {
    const prepared = prepareComponentDefinition({
      source: `
type Props = { items: string[] };
export default function Amplifier({ items }: Props) {
  return <>{items.map(() => <span>${"x".repeat(512)}</span>)}</>;
}`,
    });
    const amplifier: ComponentDefinition = {
      ...prepared,
      id: prepared.tag,
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
    };
    await expect(
      renderComponentHtml(
        amplifier,
        { items: Array.from({ length: 1_000 }, () => "item") },
        { maxOutputBytes: 1_024 },
      ),
    ).rejects.toMatchObject({ code: "output_too_large" });
  });

  it("reports unknown and deleted Components", async () => {
    const unknown = '<Component type="missing" data={{}} />';
    expect(
      (await validateArticleSourceComponents(unknown, definitions)).issues[0]
        ?.code,
    ).toBe("unknown_component");
    const deleted = new Map(definitions);
    deleted.set("tabs", { ...definitions.get("tabs")!, deletedAt: date });
    expect(
      (await validateArticleSourceComponents(tabsSource, deleted)).issues[0]
        ?.code,
    ).toBe("deleted_component");
    expect(
      (
        await validateArticleSourceComponents(tabsSource, deleted, {
          allowDeleted: true,
        })
      ).valid,
    ).toBe(true);
  });

  it("detaches exactly one selected reference", async () => {
    const source = `${tabsSource}\n${tabsSource}`;
    const second = parseArticleSource(source).references[1]!;
    const detached = await detachComponentReference(
      source,
      { start: second.start },
      definitions,
    );
    const remaining = parseArticleSource(detached).references;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.start).toBe(tabsSource.indexOf("<Component"));
    expect(detached).toContain('<div class="article-tabs">');
  });

  it("materializes one type and leaves other managed references intact", async () => {
    const quote = definitions.get("attributed-quote")!;
    const quoteSource = createComponentReference(
      "attributed-quote",
      quote.sampleData,
      quote.schema,
    );
    const source = `${tabsSource}\n${quoteSource}`;
    const materialized = await materializeComponentId(
      source,
      "tabs",
      definitions.get("tabs")!,
    );
    expect(
      parseArticleSource(materialized).references.map((item) => item.id),
    ).toEqual(["attributed-quote"]);
    expect(materialized).toContain('<div class="article-tabs">');
  });
});

describe("Article Source formatting", () => {
  it("masks directives while ordinary HTML is formatted", async () => {
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
