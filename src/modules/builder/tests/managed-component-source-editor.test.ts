import { describe, expect, it } from "vitest";

import {
  findManagedComponentReferenceRanges,
  managedComponentDisplayTag,
  readManagedComponentReference,
} from "../components/managed-component-source";

describe("managed Component source widgets", () => {
  it("displays the current name-derived tag while retaining the stable ID", () => {
    expect(
      managedComponentDisplayTag("component-pk", [
        {
          id: "component-pk",
          tag: "SimpleTabs",
          name: "Simple Tabs",
          description: "Tabs.",
        },
      ]),
    ).toBe("SimpleTabs");
  });

  it("finds multiline directives and hides all data", () => {
    const source = `<p>Before</p>
<Component
  type="tabs"
  data={{ tabs: [{ label: "One", content: html\`<a title="A /> B">Body</a>\` }] }}
/>
<p>After</p>`;

    const [reference] = findManagedComponentReferenceRanges(source);

    expect(reference).toMatchObject({ index: 0, id: "tabs" });
    expect(source.slice(reference.from, reference.to)).toContain("data={{");
    expect(source.slice(reference.from, reference.to)).toContain("A /> B");
  });

  it("numbers only valid Component references in document order", () => {
    const source = [
      '<ComponentCard type="not-a-reference" />',
      '<Component type="attributed-quote" data={{ quote: "Hello" }} />',
      '<Component type="image-carousel" data={{ images: [] }} />',
    ].join("\n");

    expect(findManagedComponentReferenceRanges(source)).toMatchObject([
      { index: 0, id: "attributed-quote" },
      { index: 1, id: "image-carousel" },
    ]);
  });

  it("ignores incomplete and untyped directives", () => {
    const source = [
      "<Component data={{}} />",
      '<Component type="tabs" data={{',
    ].join("\n");

    expect(findManagedComponentReferenceRanges(source)).toEqual([]);
  });

  it("does not mistake paired Component markup with nested self-closing HTML for a chip", () => {
    const source = '<Component type="simple-quote"><img />';

    expect(findManagedComponentReferenceRanges(source)).toEqual([]);
  });

  it("reads a valid chip while another Component edit is incomplete", () => {
    const valid = '<Component type="simple-quote" data={{}} />';
    const source = `${valid}\n<Component type="tabs" data={{`;
    const [selected] = findManagedComponentReferenceRanges(source);

    expect(readManagedComponentReference(source, selected!)).toMatchObject({
      id: "simple-quote",
      raw: valid,
    });
  });
});
