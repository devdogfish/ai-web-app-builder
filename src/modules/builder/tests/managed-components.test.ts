import { describe, expect, it } from "vitest";

import { prepareComponentDefinition } from "../../components/authoring";
import type { ComponentDefinition } from "../../components/contracts";
import {
  assertValidManagedArticleSource,
  compileManagedArticleSource,
  formatManagedArticleSource,
} from "../content";

const tabs: ComponentDefinition = {
  ...prepareComponentDefinition({
    source: `
type Props = { tabs: Array<{ label: string; content: React.ReactNode }> };
export default function Tabs({ tabs }: Props) {
  return <div className="tabs">{tabs.map(tab => <section><h2>{tab.label}</h2>{tab.content}</section>)}</div>;
}`,
  }),
  id: "tabs",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};
const simpleQuote: ComponentDefinition = {
  ...prepareComponentDefinition({
    source: `
type Props = { quote: string; attribution: string };
/** A simple quote. */
export default function SimpleQuote({ quote, attribution }: Props) {
  return <blockquote><p>{quote}</p><p className="attribution">{attribution}</p></blockquote>;
}`,
  }),
  id: "simple-quote",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};
const imageGallery: ComponentDefinition = {
  ...prepareComponentDefinition({
    source: `
type Props = { hero?: ImageSource; galleries: Array<Array<ImageSource>> };
export default function ImageGallery({ hero = "/media/default.webp", galleries }: Props) {
  return <div><img src={hero} alt="" />{galleries.flat().map(src => <img src={src} alt="" />)}</div>;
}`,
  }),
  id: "image-gallery",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};
const lookup = new Map([
  [tabs.id, tabs],
  [simpleQuote.id, simpleQuote],
  [imageGallery.id, imageGallery],
]);

describe("managed Article Source", () => {
  it("formats surrounding HTML while preserving canonical Component data", async () => {
    const source =
      '<article><p>Intro</p><Component type="tabs" data={{tabs:[{label:"One",content:html`<a title="Example">Body</a>`}]}} /></article>';

    const formatted = await formatManagedArticleSource(source, lookup);

    expect(formatted).toContain("<article>");
    expect(formatted).toContain('<Component id="tabs"');
    expect(formatted).toContain('"content": html`<a title="Example">Body</a>`');
    await assertValidManagedArticleSource(formatted, lookup);
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

  it("lifts block Components out of paragraph wrappers before compilation", async () => {
    const source = `<article>
      <p><Component type="simple-quote" data={{ quote: "First", attribution: "One" }} /></p>
      <p><Component type="simple-quote" data={{ quote: "Second", attribution: "Two" }} /></p>
    </article>`;

    const formatted = await formatManagedArticleSource(source, lookup);
    const compiled = await compileManagedArticleSource(formatted, lookup);

    expect(formatted).not.toMatch(/<p>\s*<Component/);
    expect(formatted.match(/id="simple-quote"/g)).toHaveLength(2);
    expect(compiled.match(/<blockquote>/g)).toHaveLength(2);
    expect(compiled).not.toMatch(/<p>\s*<blockquote>/);
  });

  it("blocks unknown or invalid Component references", async () => {
    await expect(
      assertValidManagedArticleSource(
        '<Component type="missing" data={{}} />',
        lookup,
      ),
    ).rejects.toThrow("Unknown Component id missing");
    await expect(
      assertValidManagedArticleSource(
        '<Component type="tabs" data={{ tabs: [{ label: "One" }] }} />',
        lookup,
      ),
    ).rejects.toThrow("content is required");
  });

  it("allows data edits but blocks implicit detachment", async () => {
    const previous =
      '<Component type="tabs" data={{ tabs: [{ label: "One", content: html`<p>Before</p>` }] }} />';
    const updated =
      '<Component type="tabs" data={{ tabs: [{ label: "One", content: html`<p>After</p>` }] }} />';
    await expect(
      assertValidManagedArticleSource(updated, lookup, {
        previousSource: previous,
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertValidManagedArticleSource("<p>Detached</p>", lookup, {
        previousSource: previous,
      }),
    ).rejects.toThrow("confirmed Detach action");
  });

  it("allows only attached Article Images in Component data", async () => {
    const source =
      '<Component type="image-gallery" data={{ hero: "/media/hero.webp", galleries: [["/media/nested.webp"]] }} />';

    await expect(
      assertValidManagedArticleSource(source, lookup, {
        availableImageSources: new Set([
          "/media/hero.webp",
          "/media/nested.webp",
        ]),
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertValidManagedArticleSource(source, lookup, {
        availableImageSources: new Set(["/media/hero.webp"]),
      }),
    ).rejects.toThrow(
      "data.galleries[0][0] must use an image attached to this Article",
    );
  });

  it("applies Article Image policy to default Component data", async () => {
    const source =
      '<Component type="image-gallery" data={{ galleries: [["/media/nested.webp"]] }} />';

    await expect(
      assertValidManagedArticleSource(source, lookup, {
        availableImageSources: new Set(["/media/nested.webp"]),
      }),
    ).rejects.toThrow("data.hero must use an image attached to this Article");
  });
});
