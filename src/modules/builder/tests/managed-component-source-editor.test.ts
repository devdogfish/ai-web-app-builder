import { describe, expect, it } from "vitest";

import { findManagedComponentReferenceRanges } from "../components/managed-component-source";

describe("managed Component source widgets", () => {
  it("finds multiline directives and hides all data", () => {
    const source = `<p>Before</p>
<Component
  type="tabs"
  data={{ tabs: [{ label: "One", content: html\`<a title="A /> B">Body</a>\` }] }}
/>
<p>After</p>`;

    const [reference] = findManagedComponentReferenceRanges(source);

    expect(reference).toMatchObject({ index: 0, type: "tabs" });
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
      { index: 0, type: "attributed-quote" },
      { index: 1, type: "image-carousel" },
    ]);
  });

  it("ignores incomplete and untyped directives", () => {
    const source = [
      "<Component data={{}} />",
      '<Component type="tabs" data={{',
    ].join("\n");

    expect(findManagedComponentReferenceRanges(source)).toEqual([]);
  });
});
