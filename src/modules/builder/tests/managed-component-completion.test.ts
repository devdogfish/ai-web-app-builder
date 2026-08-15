import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

import {
  componentReferenceSource,
  managedComponentCompletion,
} from "../components/managed-component-completion";

const summaries = [
  {
    id: "component-simple-quote",
    tag: "SimpleQuote",
    name: "Simple Quote",
    description: "A two-field quotation.",
  },
  {
    id: "component-tabs",
    tag: "Tabs",
    name: "Tabs",
    description: "Interactive tabs.",
  },
];

function completionFor(source: string) {
  const state = EditorState.create({
    doc: source,
    selection: { anchor: source.length },
  });
  return managedComponentCompletion(
    new CompletionContext(state, source.length, false),
    summaries,
    vi.fn(),
  );
}

describe("managed Component completion", () => {
  it.each(["<C", "<Co", "<Component"])(
    "offers all library Components for generic trigger %s",
    (source) => {
      const result = completionFor(source);

      expect(result?.from).toBe(1);
      expect(result?.options.map((option) => option.displayLabel)).toEqual([
        "SimpleQuote",
        "Tabs",
      ]);
      expect(result?.filter).toBe(false);
    },
  );

  it.each(["<S", "<Si", "<Simple", "<SimpleQuote"])(
    "offers library Components for %s",
    (source) => {
      const result = completionFor(source);

      expect(result?.from).toBe(1);
      expect(result?.options.map((option) => option.displayLabel)).toEqual([
        "SimpleQuote",
      ]);
      expect(result?.filter).toBeUndefined();
    },
  );

  it.each(["<", "<Card", "ordinary text"])(
    "does not intercept ordinary HTML input %s",
    (source) => {
      expect(completionFor(source)).toBeNull();
    },
  );

  it("generates canonical self-closing Component Source", () => {
    expect(componentReferenceSource("component-simple-quote")).toBe(
      '<Component id="component-simple-quote" data={{}} />',
    );
    expect(componentReferenceSource("component-simple-quote")).not.toContain(
      "</Component>",
    );
  });
});
