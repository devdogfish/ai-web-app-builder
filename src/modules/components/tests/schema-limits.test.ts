import { describe, expect, it } from "vitest";

import type { ComponentFieldSchema, ComponentSchema } from "../contracts";
import {
  MAX_COMPONENT_ARRAY_ITEMS,
  MAX_COMPONENT_DATA_STRING_BYTES,
  MAX_COMPONENT_STRUCTURE_DEPTH,
  assertValidPreparedComponentContract,
} from "../schema";

function contract(field: ComponentFieldSchema, value = fieldValue(field)) {
  const schema: ComponentSchema = {
    type: "object",
    additionalProperties: false,
    properties: { value: field },
    required: ["value"],
  };
  return {
    schema,
    uiHints: {},
    defaultData: { value },
    sampleData: { value },
  };
}

function fieldValue(field: ComponentFieldSchema): unknown {
  if (field.type === "object") {
    return { value: fieldValue(field.properties.value!) };
  }
  if (field.type === "array") return [];
  if (field.type === "number") return 0;
  if (field.type === "boolean") return false;
  if (field.type === "choice") return field.options[0]?.value;
  return "safe";
}

describe("Component contract complexity limits", () => {
  it("accepts a conservative anchored pattern and rejects risky regex features", () => {
    expect(() =>
      assertValidPreparedComponentContract(
        contract({ type: "string", pattern: "^[a-z0-9-]+$" }),
      ),
    ).not.toThrow();
    expect(() =>
      assertValidPreparedComponentContract(
        contract({ type: "string", pattern: "^(a+)+$" }),
      ),
    ).toThrow(/cannot use groups/);
  });

  it("rejects multiple variable-width bounded quantifiers", () => {
    expect(() =>
      assertValidPreparedComponentContract(
        contract({ type: "string", pattern: "^a{0,1000}a{0,1000}b$" }),
      ),
    ).toThrow(/multiple variable-width quantifiers/);
  });

  it("rejects deeply nested contracts before recursive validation", () => {
    let field: ComponentFieldSchema = { type: "string" };
    for (let index = 0; index <= MAX_COMPONENT_STRUCTURE_DEPTH; index += 1) {
      field = {
        type: "object",
        additionalProperties: false,
        properties: { value: field },
        required: ["value"],
      };
    }
    expect(() => assertValidPreparedComponentContract(contract(field))).toThrow(
      /nesting limit/,
    );
  });

  it("rejects oversized strings and arrays independently of the action cap", () => {
    expect(() =>
      assertValidPreparedComponentContract(
        contract(
          { type: "string" },
          "x".repeat(MAX_COMPONENT_DATA_STRING_BYTES + 1),
        ),
      ),
    ).toThrow(/string limit/);

    expect(() =>
      assertValidPreparedComponentContract(
        contract(
          { type: "array", items: { type: "string" } },
          Array(MAX_COMPONENT_ARRAY_ITEMS + 1).fill("x"),
        ),
      ),
    ).toThrow(/array limit/);
  });
});
