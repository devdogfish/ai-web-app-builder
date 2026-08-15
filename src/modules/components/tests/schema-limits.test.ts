import { describe, expect, it } from "vitest";

import type { ComponentDefinitionInput, ComponentFieldSchema } from "../contracts";
import {
  MAX_COMPONENT_ARRAY_ITEMS,
  MAX_COMPONENT_DATA_STRING_BYTES,
  MAX_COMPONENT_STRUCTURE_DEPTH,
  normalizeComponentInput,
} from "../schema";

function definition(field: ComponentFieldSchema): ComponentDefinitionInput {
  return {
    type: "bounded",
    description: "A bounded test Component.",
    htmlTemplate: "<div>{{value}}</div>",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { value: field },
      required: ["value"],
    },
    defaultData: { value: fieldValue(field) },
  };
}

function fieldValue(field: ComponentFieldSchema): unknown {
  if (field.type === "object") return { value: fieldValue(field.properties.value!) };
  if (field.type === "array") return [];
  return "safe";
}

describe("Component definition complexity limits", () => {
  it("accepts a conservative anchored pattern and rejects risky regex features", () => {
    expect(() =>
      normalizeComponentInput(
        definition({ type: "string", pattern: "^[a-z0-9-]+$" }),
      ),
    ).not.toThrow();
    expect(() =>
      normalizeComponentInput(
        definition({ type: "string", pattern: "^(a+)+$" }),
      ),
    ).toThrow(/cannot use groups/);
  });

  it("rejects multiple variable-width bounded quantifiers", () => {
    expect(() =>
      normalizeComponentInput(
        definition({
          type: "string",
          pattern: "^a{0,1000}a{0,1000}b$",
        }),
      ),
    ).toThrow(/multiple variable-width quantifiers/);
  });

  it("rejects deeply nested schemas before recursive validation", () => {
    let field: ComponentFieldSchema = { type: "string" };
    for (let index = 0; index <= MAX_COMPONENT_STRUCTURE_DEPTH; index += 1) {
      field = {
        type: "object",
        additionalProperties: false,
        properties: { value: field },
        required: ["value"],
      };
    }
    expect(() => normalizeComponentInput(definition(field))).toThrow(/nesting limit/);
  });

  it("rejects oversized strings and arrays independently of the 52 MB action cap", () => {
    expect(() =>
      normalizeComponentInput({
        ...definition({ type: "string" }),
        defaultData: { value: "x".repeat(MAX_COMPONENT_DATA_STRING_BYTES + 1) },
      }),
    ).toThrow(/string limit/);

    expect(() =>
      normalizeComponentInput({
        ...definition({ type: "array", items: { type: "string" } }),
        defaultData: { value: Array(MAX_COMPONENT_ARRAY_ITEMS + 1).fill("x") },
      }),
    ).toThrow(/array limit/);
  });

  it("rejects excessive template loop nesting", () => {
    const each = "{{#each value}}".repeat(MAX_COMPONENT_STRUCTURE_DEPTH + 1);
    const close = "{{/each}}".repeat(MAX_COMPONENT_STRUCTURE_DEPTH + 1);
    expect(() =>
      normalizeComponentInput({
        ...definition({ type: "array", items: { type: "string" } }),
        htmlTemplate: `${each}{{this}}${close}`,
      }),
    ).toThrow(/each-block nesting limit/);
  });
});
