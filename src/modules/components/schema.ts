import type {
  ComponentData,
  ComponentDataIssue,
  ComponentDataValidation,
  ComponentDefinitionInput,
  ComponentFieldSchema,
  ComponentSchema,
  ComponentUiHints,
} from "./contracts";
import { ComponentValidationError } from "./contracts";

export const COMPONENT_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const MAX_COMPONENT_TYPE_LENGTH = 80;
export const MAX_COMPONENT_DESCRIPTION_LENGTH = 500;
export const MAX_COMPONENT_TEMPLATE_BYTES = 500_000;
export const MAX_COMPONENT_DEFINITION_DATA_BYTES = 1_000_000;
export const MAX_COMPONENT_DATA_STRING_BYTES = 500_000;
export const MAX_COMPONENT_STRUCTURE_DEPTH = 16;
export const MAX_COMPONENT_STRUCTURE_NODES = 10_000;
export const MAX_COMPONENT_OBJECT_PROPERTIES = 100;
export const MAX_COMPONENT_ARRAY_ITEMS = 1_000;
export const MAX_COMPONENT_CHOICE_OPTIONS = 100;
export const MAX_COMPONENT_SCHEMA_TEXT_LENGTH = 500;
export const MAX_COMPONENT_PROPERTY_NAME_LENGTH = 100;
export const MAX_COMPONENT_PATTERN_LENGTH = 256;
export const MAX_COMPONENT_TEMPLATE_EACH_BLOCKS = 200;

const textEncoder = new TextEncoder();
const UI_CONTROLS = new Set([
  "text",
  "textarea",
  "rich-html",
  "image",
  "number",
  "checkbox",
  "select",
  "list",
  "group",
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function schemaProblem(message: string): never {
  throw new ComponentValidationError("invalid_schema", message);
}

function assertBoundedDefinitionData(input: ComponentDefinitionInput): void {
  const stack: Array<{ value: unknown; depth: number; path: string }> = [
    { value: input.schema, depth: 0, path: "schema" },
    { value: input.uiHints ?? {}, depth: 0, path: "uiHints" },
    { value: input.defaultData ?? {}, depth: 0, path: "defaultData" },
    ...(input.sampleData === undefined
      ? []
      : [{ value: input.sampleData, depth: 0, path: "sampleData" }]),
  ];
  const seen = new WeakSet<object>();
  let nodes = 0;
  let bytes = 0;

  const addBytes = (value: string, path: string): void => {
    const size = textEncoder.encode(value).byteLength;
    if (size > MAX_COMPONENT_DATA_STRING_BYTES) {
      throw new ComponentValidationError(
        "invalid_data",
        `${path} exceeds the ${MAX_COMPONENT_DATA_STRING_BYTES}-byte string limit.`,
      );
    }
    bytes += size;
    if (bytes > MAX_COMPONENT_DEFINITION_DATA_BYTES) {
      throw new ComponentValidationError(
        "invalid_data",
        `Component schema and data exceed the ${MAX_COMPONENT_DEFINITION_DATA_BYTES}-byte limit.`,
      );
    }
  };

  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_COMPONENT_STRUCTURE_NODES) {
      throw new ComponentValidationError(
        "invalid_data",
        `Component schema and data exceed the ${MAX_COMPONENT_STRUCTURE_NODES}-node limit.`,
      );
    }
    if (current.depth > MAX_COMPONENT_STRUCTURE_DEPTH) {
      throw new ComponentValidationError(
        "invalid_data",
        `${current.path} exceeds the ${MAX_COMPONENT_STRUCTURE_DEPTH}-level nesting limit.`,
      );
    }

    const value = current.value;
    if (typeof value === "string") {
      addBytes(value, current.path);
      continue;
    }
    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      bytes += 16;
      continue;
    }
    if (typeof value !== "object") {
      throw new ComponentValidationError(
        "invalid_data",
        `${current.path} must contain JSON-compatible data.`,
      );
    }
    if (seen.has(value)) {
      throw new ComponentValidationError(
        "invalid_data",
        `${current.path} contains a circular or repeated object reference.`,
      );
    }
    seen.add(value);

    if (Array.isArray(value)) {
      if (value.length > MAX_COMPONENT_ARRAY_ITEMS) {
        throw new ComponentValidationError(
          "invalid_data",
          `${current.path} exceeds the ${MAX_COMPONENT_ARRAY_ITEMS}-item array limit.`,
        );
      }
      bytes += value.length;
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({
          value: value[index],
          depth: current.depth + 1,
          path: `${current.path}[${index}]`,
        });
      }
      continue;
    }

    const entries = Object.entries(value);
    if (entries.length > MAX_COMPONENT_OBJECT_PROPERTIES) {
      throw new ComponentValidationError(
        "invalid_data",
        `${current.path} exceeds the ${MAX_COMPONENT_OBJECT_PROPERTIES}-property object limit.`,
      );
    }
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, child] = entries[index]!;
      addBytes(key, `${current.path} property name`);
      stack.push({
        value: child,
        depth: current.depth + 1,
        path: `${current.path}.${key}`,
      });
    }
  }
}

function assertSafePattern(pattern: unknown, path: string): asserts pattern is string {
  if (typeof pattern !== "string") schemaProblem(`${path} must be a string.`);
  if (
    pattern.length > MAX_COMPONENT_PATTERN_LENGTH ||
    !pattern.startsWith("^") ||
    !pattern.endsWith("$")
  ) {
    schemaProblem(
      `${path} must be an anchored pattern of at most ${MAX_COMPONENT_PATTERN_LENGTH} characters.`,
    );
  }
  if (/[()|]/.test(pattern) || /\\(?:[1-9]|k<)/.test(pattern)) {
    schemaProblem(`${path} cannot use groups, alternation, lookarounds, or backreferences.`);
  }
  const unboundedQuantifiers =
    pattern.match(/(^|[^\\])(?:\\\\)*[+*?]/g) ?? [];
  let variableBoundedQuantifiers = 0;
  if (unboundedQuantifiers.length > 1 || /[*+?}][*+?{]/.test(pattern)) {
    schemaProblem(`${path} uses unsafe repeated quantifiers.`);
  }
  for (const match of pattern.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
    const lower = Number(match[1]);
    const upper = match[2] === undefined ? lower : Number(match[2]);
    if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || upper > 1_000) {
      schemaProblem(`${path} uses an unsafe repetition bound.`);
    }
    if (upper !== lower) variableBoundedQuantifiers += 1;
  }
  if (/\{\d+,\}/.test(pattern)) {
    schemaProblem(`${path} cannot use an unbounded repetition range.`);
  }
  if (unboundedQuantifiers.length + variableBoundedQuantifiers > 1) {
    schemaProblem(`${path} cannot use multiple variable-width quantifiers.`);
  }
  try {
    new RegExp(pattern);
  } catch {
    schemaProblem(`${path} must be a valid regular expression.`);
  }
}

function assertTemplateComplexity(template: string): void {
  const tokens = template.matchAll(/{{\s*(#each\s+[^}]+|\/each)\s*}}/g);
  let depth = 0;
  let blocks = 0;
  for (const token of tokens) {
    if (token[1]?.startsWith("#each")) {
      depth += 1;
      blocks += 1;
      if (depth > MAX_COMPONENT_STRUCTURE_DEPTH) {
        throw new ComponentValidationError(
          "invalid_template",
          `Component HTML exceeds the ${MAX_COMPONENT_STRUCTURE_DEPTH}-level each-block nesting limit.`,
        );
      }
      if (blocks > MAX_COMPONENT_TEMPLATE_EACH_BLOCKS) {
        throw new ComponentValidationError(
          "invalid_template",
          `Component HTML exceeds the ${MAX_COMPONENT_TEMPLATE_EACH_BLOCKS}-block each limit.`,
        );
      }
    } else {
      depth = Math.max(0, depth - 1);
    }
  }
}

function assertNonNegativeInteger(value: unknown, label: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0)) {
    schemaProblem(`${label} must be a non-negative integer.`);
  }
}

function assertFieldSchema(
  schema: unknown,
  path: string,
  seen: Set<object>,
): asserts schema is ComponentFieldSchema {
  if (!isObject(schema)) schemaProblem(`${path} must be an object.`);
  if (seen.has(schema)) schemaProblem(`${path} contains a circular reference.`);
  seen.add(schema);

  const allowedBase = new Set(["type", "description"]);
  if (schema.description !== undefined && typeof schema.description !== "string") {
    schemaProblem(`${path}.description must be a string.`);
  }
  if (
    typeof schema.description === "string" &&
    schema.description.length > MAX_COMPONENT_SCHEMA_TEXT_LENGTH
  ) {
    schemaProblem(
      `${path}.description exceeds ${MAX_COMPONENT_SCHEMA_TEXT_LENGTH} characters.`,
    );
  }

  switch (schema.type) {
    case "string":
    case "html": {
      const allowed = new Set([
        ...allowedBase,
        "minLength",
        "maxLength",
        "default",
        ...(schema.type === "string" ? ["pattern"] : []),
      ]);
      assertOnlyKeys(schema, allowed, path);
      assertNonNegativeInteger(schema.minLength, `${path}.minLength`);
      assertNonNegativeInteger(schema.maxLength, `${path}.maxLength`);
      if (
        Number(schema.minLength ?? 0) > MAX_COMPONENT_DATA_STRING_BYTES ||
        Number(schema.maxLength ?? 0) > MAX_COMPONENT_DATA_STRING_BYTES
      ) {
        schemaProblem(`${path} string lengths cannot exceed ${MAX_COMPONENT_DATA_STRING_BYTES}.`);
      }
      if (
        schema.minLength !== undefined &&
        schema.maxLength !== undefined &&
        Number(schema.minLength) > Number(schema.maxLength)
      ) {
        schemaProblem(`${path}.minLength cannot exceed maxLength.`);
      }
      if (schema.default !== undefined && typeof schema.default !== "string") {
        schemaProblem(`${path}.default must be a string.`);
      }
      if (schema.type === "string" && schema.pattern !== undefined) {
        assertSafePattern(schema.pattern, `${path}.pattern`);
      }
      break;
    }
    case "image":
      assertOnlyKeys(schema, new Set([...allowedBase, "default"]), path);
      if (schema.default !== undefined && typeof schema.default !== "string") {
        schemaProblem(`${path}.default must be a string.`);
      }
      break;
    case "number":
      assertOnlyKeys(
        schema,
        new Set([...allowedBase, "integer", "minimum", "maximum", "default"]),
        path,
      );
      for (const key of ["minimum", "maximum", "default"] as const) {
        if (schema[key] !== undefined && !Number.isFinite(schema[key])) {
          schemaProblem(`${path}.${key} must be a finite number.`);
        }
      }
      if (schema.integer !== undefined && typeof schema.integer !== "boolean") {
        schemaProblem(`${path}.integer must be a boolean.`);
      }
      if (
        schema.minimum !== undefined &&
        schema.maximum !== undefined &&
        Number(schema.minimum) > Number(schema.maximum)
      ) {
        schemaProblem(`${path}.minimum cannot exceed maximum.`);
      }
      break;
    case "boolean":
      assertOnlyKeys(schema, new Set([...allowedBase, "default"]), path);
      if (schema.default !== undefined && typeof schema.default !== "boolean") {
        schemaProblem(`${path}.default must be a boolean.`);
      }
      break;
    case "choice": {
      assertOnlyKeys(schema, new Set([...allowedBase, "options", "default"]), path);
      if (!Array.isArray(schema.options) || schema.options.length === 0) {
        schemaProblem(`${path}.options must be a non-empty array.`);
      }
      if (schema.options.length > MAX_COMPONENT_CHOICE_OPTIONS) {
        schemaProblem(
          `${path}.options exceeds the ${MAX_COMPONENT_CHOICE_OPTIONS}-option limit.`,
        );
      }
      const values = new Set<string>();
      for (const [index, option] of schema.options.entries()) {
        if (
          !isObject(option) ||
          typeof option.value !== "string" ||
          (option.label !== undefined && typeof option.label !== "string")
        ) {
          schemaProblem(`${path}.options[${index}] is invalid.`);
        }
        assertOnlyKeys(option, new Set(["value", "label"]), `${path}.options[${index}]`);
        if (
          option.value.length > MAX_COMPONENT_SCHEMA_TEXT_LENGTH ||
          (option.label?.length ?? 0) > MAX_COMPONENT_SCHEMA_TEXT_LENGTH
        ) {
          schemaProblem(`${path}.options[${index}] contains text that is too long.`);
        }
        if (values.has(option.value)) {
          schemaProblem(`${path}.options contains duplicate value ${option.value}.`);
        }
        values.add(option.value);
      }
      if (schema.default !== undefined && !values.has(String(schema.default))) {
        schemaProblem(`${path}.default must match an option value.`);
      }
      break;
    }
    case "object": {
      assertOnlyKeys(
        schema,
        new Set([...allowedBase, "properties", "required", "additionalProperties"]),
        path,
      );
      if (!isObject(schema.properties)) {
        schemaProblem(`${path}.properties must be an object.`);
      }
      if (Object.keys(schema.properties).length > MAX_COMPONENT_OBJECT_PROPERTIES) {
        schemaProblem(
          `${path}.properties exceeds the ${MAX_COMPONENT_OBJECT_PROPERTIES}-property limit.`,
        );
      }
      if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
        schemaProblem(`${path}.additionalProperties must be false.`);
      }
      for (const [key, child] of Object.entries(schema.properties)) {
        if (
          !key ||
          key.length > MAX_COMPONENT_PROPERTY_NAME_LENGTH ||
          key === "__proto__" ||
          key === "prototype" ||
          key === "constructor" ||
          key.includes(".") ||
          key.includes("[") ||
          key.includes("]")
        ) {
          schemaProblem(`${path}.properties has invalid key ${JSON.stringify(key)}.`);
        }
        assertFieldSchema(child, `${path}.properties.${key}`, seen);
      }
      if (schema.required !== undefined) {
        if (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== "string")) {
          schemaProblem(`${path}.required must be an array of property names.`);
        }
        const unique = new Set(schema.required);
        if (unique.size !== schema.required.length) {
          schemaProblem(`${path}.required cannot contain duplicates.`);
        }
        for (const key of unique) {
          if (!(key in schema.properties)) {
            schemaProblem(`${path}.required references unknown property ${key}.`);
          }
        }
      }
      break;
    }
    case "array":
      assertOnlyKeys(
        schema,
        new Set([...allowedBase, "items", "minItems", "maxItems"]),
        path,
      );
      assertNonNegativeInteger(schema.minItems, `${path}.minItems`);
      assertNonNegativeInteger(schema.maxItems, `${path}.maxItems`);
      if (
        Number(schema.minItems ?? 0) > MAX_COMPONENT_ARRAY_ITEMS ||
        Number(schema.maxItems ?? 0) > MAX_COMPONENT_ARRAY_ITEMS
      ) {
        schemaProblem(`${path} item limits cannot exceed ${MAX_COMPONENT_ARRAY_ITEMS}.`);
      }
      if (
        schema.minItems !== undefined &&
        schema.maxItems !== undefined &&
        Number(schema.minItems) > Number(schema.maxItems)
      ) {
        schemaProblem(`${path}.minItems cannot exceed maxItems.`);
      }
      assertFieldSchema(schema.items, `${path}.items`, seen);
      break;
    default:
      schemaProblem(`${path}.type is not supported.`);
  }
  seen.delete(schema);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) schemaProblem(`${path} has unknown field ${unknown}.`);
}

export function assertValidComponentSchema(schema: unknown): asserts schema is ComponentSchema {
  assertFieldSchema(schema, "schema", new Set());
  if (schema.type !== "object") {
    schemaProblem("A Component schema must have an object root.");
  }
}

function issue(
  issues: ComponentDataIssue[],
  path: string,
  code: ComponentDataIssue["code"],
  message: string,
): void {
  issues.push({ path, code, message });
}

function validateField(
  schema: ComponentFieldSchema,
  value: unknown,
  path: string,
  issues: ComponentDataIssue[],
): void {
  switch (schema.type) {
    case "string":
    case "html":
    case "image": {
      if (typeof value !== "string") {
        issue(issues, path, "wrong_type", `${path} must be a string.`);
        return;
      }
      if ("minLength" in schema && schema.minLength !== undefined && value.length < schema.minLength) {
        issue(issues, path, "too_short", `${path} is shorter than ${schema.minLength}.`);
      }
      if ("maxLength" in schema && schema.maxLength !== undefined && value.length > schema.maxLength) {
        issue(issues, path, "too_long", `${path} is longer than ${schema.maxLength}.`);
      }
      if (schema.type === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) {
        issue(issues, path, "pattern", `${path} does not match its required pattern.`);
      }
      return;
    }
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issue(issues, path, "wrong_type", `${path} must be a finite number.`);
        return;
      }
      if (schema.integer && !Number.isSafeInteger(value)) {
        issue(issues, path, "invalid_value", `${path} must be an integer.`);
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        issue(issues, path, "invalid_value", `${path} must be at least ${schema.minimum}.`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        issue(issues, path, "invalid_value", `${path} must be at most ${schema.maximum}.`);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        issue(issues, path, "wrong_type", `${path} must be a boolean.`);
      }
      return;
    case "choice":
      if (typeof value !== "string") {
        issue(issues, path, "wrong_type", `${path} must be a string.`);
      } else if (!schema.options.some((option) => option.value === value)) {
        issue(issues, path, "invalid_value", `${path} is not an allowed choice.`);
      }
      return;
    case "array":
      if (!Array.isArray(value)) {
        issue(issues, path, "wrong_type", `${path} must be an array.`);
        return;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        issue(issues, path, "too_few", `${path} needs at least ${schema.minItems} items.`);
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        issue(issues, path, "too_many", `${path} allows at most ${schema.maxItems} items.`);
      }
      value.forEach((item, index) => validateField(schema.items, item, `${path}[${index}]`, issues));
      return;
    case "object": {
      if (!isObject(value)) {
        issue(issues, path, "wrong_type", `${path} must be an object.`);
        return;
      }
      const required = new Set(schema.required ?? []);
      for (const key of required) {
        if (!(key in value)) {
          issue(issues, `${path}.${key}`, "required", `${path}.${key} is required.`);
        }
      }
      for (const [key, child] of Object.entries(value)) {
        const childSchema = schema.properties[key];
        if (!childSchema) {
          issue(issues, `${path}.${key}`, "unknown_property", `${path}.${key} is not allowed.`);
        } else {
          validateField(childSchema, child, `${path}.${key}`, issues);
        }
      }
      return;
    }
  }
}

export function validateComponentData(
  schema: ComponentSchema,
  data: unknown,
): ComponentDataValidation {
  const issues: ComponentDataIssue[] = [];
  validateField(schema, data, "$", issues);
  return { valid: issues.length === 0, issues };
}

export function assertValidComponentData(
  schema: ComponentSchema,
  data: unknown,
  code: "invalid_default_data" | "invalid_sample_data" | "invalid_data" = "invalid_data",
): asserts data is ComponentData {
  const validation = validateComponentData(schema, data);
  if (!validation.valid) {
    throw new ComponentValidationError(
      code,
      validation.issues.map((item) => item.message).join(" "),
      validation.issues,
    );
  }
}

function assertUiHints(hints: unknown, schema: ComponentSchema): asserts hints is ComponentUiHints {
  if (!isObject(hints)) {
    throw new ComponentValidationError("invalid_ui_hints", "UI hints must be an object.");
  }
  const paths = collectSchemaPaths(schema);
  for (const [path, hint] of Object.entries(hints)) {
    if (!paths.has(path)) {
      throw new ComponentValidationError("invalid_ui_hints", `UI hint path ${path} is not in the schema.`);
    }
    if (!isObject(hint)) {
      throw new ComponentValidationError("invalid_ui_hints", `UI hint ${path} must be an object.`);
    }
    const allowed = new Set(["label", "helpText", "placeholder", "control", "order"]);
    const unknown = Object.keys(hint).find((key) => !allowed.has(key));
    if (unknown) {
      throw new ComponentValidationError("invalid_ui_hints", `UI hint ${path} has unknown field ${unknown}.`);
    }
    for (const key of ["label", "helpText", "placeholder", "control"] as const) {
      if (hint[key] !== undefined && typeof hint[key] !== "string") {
        throw new ComponentValidationError("invalid_ui_hints", `UI hint ${path}.${key} must be a string.`);
      }
      if (
        typeof hint[key] === "string" &&
        hint[key].length > MAX_COMPONENT_SCHEMA_TEXT_LENGTH
      ) {
        throw new ComponentValidationError(
          "invalid_ui_hints",
          `UI hint ${path}.${key} exceeds ${MAX_COMPONENT_SCHEMA_TEXT_LENGTH} characters.`,
        );
      }
    }
    if (
      typeof hint.control === "string" &&
      !UI_CONTROLS.has(hint.control)
    ) {
      throw new ComponentValidationError(
        "invalid_ui_hints",
        `UI hint ${path}.control is not supported.`,
      );
    }
    if (hint.order !== undefined && !Number.isFinite(hint.order)) {
      throw new ComponentValidationError("invalid_ui_hints", `UI hint ${path}.order must be a number.`);
    }
  }
}

function collectSchemaPaths(schema: ComponentSchema): Set<string> {
  const paths = new Set<string>();
  const visit = (field: ComponentFieldSchema, path: string): void => {
    if (path) paths.add(path);
    if (field.type === "object") {
      for (const [key, child] of Object.entries(field.properties)) {
        visit(child, path ? `${path}.${key}` : key);
      }
    } else if (field.type === "array") {
      visit(field.items, `${path}[]`);
    }
  };
  visit(schema, "");
  return paths;
}

export function normalizeComponentInput(input: ComponentDefinitionInput): Required<ComponentDefinitionInput> {
  if (!input || typeof input !== "object") {
    throw new ComponentValidationError("invalid_data", "Component input must be an object.");
  }
  assertBoundedDefinitionData(input);
  if (
    typeof input.type !== "string" ||
    input.type.length > MAX_COMPONENT_TYPE_LENGTH ||
    !COMPONENT_TYPE_PATTERN.test(input.type)
  ) {
    throw new ComponentValidationError(
      "invalid_type",
      "Component type must be lowercase kebab-case and start with a letter.",
    );
  }
  const description = input.description?.trim();
  if (!description || description.length > MAX_COMPONENT_DESCRIPTION_LENGTH) {
    throw new ComponentValidationError(
      "invalid_description",
      `Component description must be 1-${MAX_COMPONENT_DESCRIPTION_LENGTH} characters.`,
    );
  }
  if (
    typeof input.htmlTemplate !== "string" ||
    input.htmlTemplate.trim().length === 0 ||
    new TextEncoder().encode(input.htmlTemplate).byteLength > MAX_COMPONENT_TEMPLATE_BYTES ||
    input.htmlTemplate.includes("\0")
  ) {
    throw new ComponentValidationError("invalid_template", "Component HTML template is empty, too large, or invalid.");
  }
  assertTemplateComplexity(input.htmlTemplate);
  assertValidComponentSchema(input.schema);
  const uiHints = input.uiHints ?? {};
  assertUiHints(uiHints, input.schema);
  const defaultData = input.defaultData ?? {};
  const sampleData = input.sampleData ?? defaultData;
  assertValidComponentData(input.schema, defaultData, "invalid_default_data");
  assertValidComponentData(input.schema, sampleData, "invalid_sample_data");
  return {
    type: input.type,
    description,
    htmlTemplate: input.htmlTemplate,
    schema: structuredClone(input.schema),
    uiHints: structuredClone(uiHints),
    defaultData: structuredClone(defaultData),
    sampleData: structuredClone(sampleData),
  };
}
