import type { ComponentData, ComponentFieldSchema, ComponentSchema } from "./contracts";

export const HTML_LITERAL = Symbol.for("article-builder.component-html-literal");
export const MAX_ARTICLE_SOURCE_BYTES = 4 * 1024 * 1024;
export const MAX_COMPONENT_SOURCE_VALUE_DEPTH = 16;
export const MAX_COMPONENT_SOURCE_VALUE_NODES = 10_000;
export const MAX_COMPONENT_SOURCE_OBJECT_PROPERTIES = 100;
export const MAX_COMPONENT_SOURCE_ARRAY_ITEMS = 1_000;
export const MAX_COMPONENT_SOURCE_STRING_CHARACTERS = 1_000_000;

const textEncoder = new TextEncoder();

export interface HtmlLiteral {
  readonly [HTML_LITERAL]: true;
  readonly value: string;
}

export function html(value: string): HtmlLiteral {
  return Object.freeze({ [HTML_LITERAL]: true as const, value });
}

export function isHtmlLiteral(value: unknown): value is HtmlLiteral {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<HtmlLiteral>)[HTML_LITERAL] === true &&
    typeof (value as Partial<HtmlLiteral>).value === "string"
  );
}

export type ComponentSourceValue =
  | string
  | number
  | boolean
  | null
  | HtmlLiteral
  | ComponentSourceValue[]
  | { [key: string]: ComponentSourceValue };

export interface ComponentReference {
  type: string;
  data: Record<string, ComponentSourceValue>;
  start: number;
  end: number;
  raw: string;
}

export interface ParsedArticleSource {
  source: string;
  references: ComponentReference[];
}

export class ComponentSourceSyntaxError extends Error {
  constructor(
    message: string,
    public readonly offset: number,
  ) {
    super(`${message} (at offset ${offset})`);
    this.name = "ComponentSourceSyntaxError";
  }
}

class ValueParser {
  private index: number;

  constructor(
    private readonly source: string,
    start: number,
    private readonly budget: { nodes: number },
  ) {
    this.index = start;
  }

  get position(): number {
    return this.index;
  }

  parse(depth = 0): ComponentSourceValue {
    this.consumeNode(depth);
    this.skipWhitespace();
    const char = this.source[this.index];
    if (char === "{") return this.parseObject(depth);
    if (char === "[") return this.parseArray(depth);
    if (char === '"' || char === "'") return this.parseString();
    if (char === "-" || (char && /[0-9]/.test(char))) return this.parseNumber();
    if (this.source.startsWith("true", this.index)) return this.keyword("true", true);
    if (this.source.startsWith("false", this.index)) return this.keyword("false", false);
    if (this.source.startsWith("null", this.index)) return this.keyword("null", null);
    if (this.source.startsWith("html", this.index)) return this.parseHtml();
    this.fail("Expected a restricted data value");
  }

  private parseObject(depth: number): Record<string, ComponentSourceValue> {
    const result: Record<string, ComponentSourceValue> = {};
    let propertyCount = 0;
    this.index++;
    this.skipWhitespace();
    if (this.source[this.index] === "}") {
      this.index++;
      return result;
    }
    while (true) {
      this.skipWhitespace();
      const char = this.source[this.index];
      const key = char === '"' || char === "'" ? this.parseString() : this.parseIdentifier();
      if (typeof key !== "string") this.fail("Object key must be a string");
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        this.fail(`Duplicate data key ${JSON.stringify(key)}`);
      }
      propertyCount += 1;
      if (propertyCount > MAX_COMPONENT_SOURCE_OBJECT_PROPERTIES) {
        this.fail(
          `Component data objects allow at most ${MAX_COMPONENT_SOURCE_OBJECT_PROPERTIES} properties`,
        );
      }
      this.skipWhitespace();
      this.expect(":");
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: this.parse(depth + 1),
        writable: true,
      });
      this.skipWhitespace();
      if (this.source[this.index] === "}") {
        this.index++;
        return result;
      }
      this.expect(",");
      this.skipWhitespace();
      if (this.source[this.index] === "}") {
        this.index++;
        return result;
      }
    }
  }

  private parseArray(depth: number): ComponentSourceValue[] {
    const result: ComponentSourceValue[] = [];
    this.index++;
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index++;
      return result;
    }
    while (true) {
      if (result.length >= MAX_COMPONENT_SOURCE_ARRAY_ITEMS) {
        this.fail(
          `Component data arrays allow at most ${MAX_COMPONENT_SOURCE_ARRAY_ITEMS} items`,
        );
      }
      result.push(this.parse(depth + 1));
      this.skipWhitespace();
      if (this.source[this.index] === "]") {
        this.index++;
        return result;
      }
      this.expect(",");
      this.skipWhitespace();
      if (this.source[this.index] === "]") {
        this.index++;
        return result;
      }
    }
  }

  private parseString(): string {
    const quote = this.source[this.index++];
    let result = "";
    while (this.index < this.source.length) {
      const char = this.source[this.index++];
      if (char === quote) return result;
      if (char !== "\\") {
        result += char;
        if (result.length > MAX_COMPONENT_SOURCE_STRING_CHARACTERS) {
          this.fail("Component data string is too long");
        }
        continue;
      }
      if (this.index >= this.source.length) this.fail("Unterminated string escape");
      const escaped = this.source[this.index++];
      const simple: Record<string, string> = {
        '"': '"',
        "'": "'",
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      if (escaped in simple) {
        result += simple[escaped];
      } else if (escaped === "u") {
        const code = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-f]{4}$/i.test(code)) this.fail("Invalid Unicode escape");
        result += String.fromCharCode(Number.parseInt(code, 16));
        this.index += 4;
      } else {
        this.fail(`Unsupported string escape \\${escaped}`);
      }
      if (result.length > MAX_COMPONENT_SOURCE_STRING_CHARACTERS) {
        this.fail("Component data string is too long");
      }
    }
    this.fail("Unterminated string");
  }

  private parseNumber(): number {
    const match = this.source.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) this.fail("Invalid number");
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail("Number must be finite");
    return value;
  }

  private parseIdentifier(): string {
    const match = this.source.slice(this.index).match(/^[A-Za-z_$][A-Za-z0-9_$-]*/);
    if (!match) this.fail("Expected an object property name");
    this.index += match[0].length;
    return match[0];
  }

  private parseHtml(): HtmlLiteral {
    this.index += 4;
    if (this.source[this.index] !== "`") this.fail("html must be followed by a template literal");
    this.index++;
    let result = "";
    while (this.index < this.source.length) {
      const char = this.source[this.index++];
      if (char === "`") return html(result);
      if (char === "\\") {
        if (this.index >= this.source.length) this.fail("Unterminated HTML literal escape");
        const escaped = this.source[this.index++];
        if (escaped === "`" || escaped === "\\") {
          result += escaped;
        } else {
          result += `\\${escaped}`;
        }
      } else {
        result += char;
      }
      if (result.length > MAX_COMPONENT_SOURCE_STRING_CHARACTERS) {
        this.fail("Component HTML literal is too long");
      }
    }
    this.fail("Unterminated HTML literal");
  }

  private keyword<T extends boolean | null>(word: string, value: T): T {
    const next = this.source[this.index + word.length];
    if (next && /[A-Za-z0-9_$]/.test(next)) this.fail(`Invalid token beginning with ${word}`);
    this.index += word.length;
    return value;
  }

  skipWhitespace(): void {
    while (/\s/.test(this.source[this.index] ?? "")) this.index++;
  }

  private consumeNode(depth: number): void {
    if (depth > MAX_COMPONENT_SOURCE_VALUE_DEPTH) {
      this.fail(
        `Component data exceeds the ${MAX_COMPONENT_SOURCE_VALUE_DEPTH}-level nesting limit`,
      );
    }
    this.budget.nodes += 1;
    if (this.budget.nodes > MAX_COMPONENT_SOURCE_VALUE_NODES) {
      this.fail(
        `Article Source exceeds the ${MAX_COMPONENT_SOURCE_VALUE_NODES}-node Component data limit`,
      );
    }
  }

  private expect(value: string): void {
    if (!this.source.startsWith(value, this.index)) this.fail(`Expected ${JSON.stringify(value)}`);
    this.index += value.length;
  }

  private fail(message: string): never {
    throw new ComponentSourceSyntaxError(message, this.index);
  }
}

function findTagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index + 1;
    }
  }
  return source.length;
}

function skipRawHtmlRegion(source: string, start: number): number | null {
  if (source.startsWith("<!--", start)) {
    const end = source.indexOf("-->", start + 4);
    return end < 0 ? source.length : end + 3;
  }
  const opening = source.slice(start).match(/^<(script|style)(?:\s|>)/i);
  if (!opening) return null;
  const openEnd = findTagEnd(source, start);
  const close = new RegExp(`</${opening[1]}\\s*>`, "ig");
  close.lastIndex = openEnd;
  const match = close.exec(source);
  return match ? match.index + match[0].length : source.length;
}

function parseQuotedAttribute(source: string, index: number): { value: string; end: number } {
  const quote = source[index];
  if (quote !== '"' && quote !== "'") {
    throw new ComponentSourceSyntaxError("Component type must be quoted", index);
  }
  let cursor = index + 1;
  let value = "";
  while (cursor < source.length) {
    const char = source[cursor++];
    if (char === quote) return { value, end: cursor };
    if (char === "\\" && cursor < source.length) {
      value += source[cursor++];
    } else {
      value += char;
    }
  }
  throw new ComponentSourceSyntaxError("Unterminated Component type", index);
}

function parseReferenceAt(
  source: string,
  start: number,
  budget: { nodes: number },
): ComponentReference {
  let index = start + "<Component".length;
  let type: string | undefined;
  let data: Record<string, ComponentSourceValue> | undefined;

  while (index < source.length) {
    while (/\s/.test(source[index] ?? "")) index++;
    if (source.startsWith("/>", index)) {
      index += 2;
      if (type === undefined) throw new ComponentSourceSyntaxError("Component type is required", index);
      if (data === undefined) throw new ComponentSourceSyntaxError("Component data is required", index);
      return { type, data, start, end: index, raw: source.slice(start, index) };
    }
    const nameMatch = source.slice(index).match(/^[A-Za-z][A-Za-z0-9-]*/);
    if (!nameMatch) throw new ComponentSourceSyntaxError("Expected Component attribute or />", index);
    const name = nameMatch[0];
    index += name.length;
    while (/\s/.test(source[index] ?? "")) index++;
    if (source[index] !== "=") throw new ComponentSourceSyntaxError(`Expected = after ${name}`, index);
    index++;
    while (/\s/.test(source[index] ?? "")) index++;

    if (name === "type") {
      if (type !== undefined) throw new ComponentSourceSyntaxError("Duplicate Component type", index);
      const parsed = parseQuotedAttribute(source, index);
      type = parsed.value;
      index = parsed.end;
    } else if (name === "data") {
      if (data !== undefined) throw new ComponentSourceSyntaxError("Duplicate Component data", index);
      if (source[index] !== "{") throw new ComponentSourceSyntaxError("Component data must use data={{...}}", index);
      const parser = new ValueParser(source, index + 1, budget);
      const value = parser.parse();
      if (Array.isArray(value) || value === null || typeof value !== "object" || isHtmlLiteral(value)) {
        throw new ComponentSourceSyntaxError("Component data root must be an object", index + 1);
      }
      parser.skipWhitespace();
      index = parser.position;
      if (source[index] !== "}") throw new ComponentSourceSyntaxError("Expected closing JSX brace for data", index);
      index++;
      data = value;
    } else {
      throw new ComponentSourceSyntaxError(`Unsupported Component attribute ${name}`, index - name.length);
    }
  }
  throw new ComponentSourceSyntaxError("Unterminated Component reference", start);
}

export function parseArticleSource(source: string): ParsedArticleSource {
  if (textEncoder.encode(source).byteLength > MAX_ARTICLE_SOURCE_BYTES) {
    throw new ComponentSourceSyntaxError(
      `Article Source exceeds the ${MAX_ARTICLE_SOURCE_BYTES}-byte limit`,
      0,
    );
  }
  const references: ComponentReference[] = [];
  const budget = { nodes: 0 };
  let index = 0;
  while (index < source.length) {
    const next = source.indexOf("<", index);
    if (next < 0) break;
    const rawEnd = skipRawHtmlRegion(source, next);
    if (rawEnd !== null) {
      index = rawEnd;
      continue;
    }
    if (source.startsWith("<Component", next)) {
      const boundary = source[next + "<Component".length];
      if (boundary && !/[\s/]/.test(boundary)) {
        index = next + 1;
        continue;
      }
      const reference = parseReferenceAt(source, next, budget);
      references.push(reference);
      index = reference.end;
    } else {
      index = next + 1;
    }
  }
  return { source, references };
}

export function unwrapComponentSourceData(value: ComponentSourceValue): unknown {
  if (isHtmlLiteral(value)) return value.value;
  if (Array.isArray(value)) return value.map(unwrapComponentSourceData);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, unwrapComponentSourceData(child)]),
    );
  }
  return value;
}

function escapeHtmlLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

function serializeValue(
  value: unknown,
  schema: ComponentFieldSchema | undefined,
  depth: number,
): string {
  if (isHtmlLiteral(value)) return `html\`${escapeHtmlLiteral(value.value)}\``;
  if (schema?.type === "html" && typeof value === "string") {
    return `html\`${escapeHtmlLiteral(value)}\``;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Component data numbers must be finite");
    return String(value);
  }
  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const childSchema = schema?.type === "array" ? schema.items : undefined;
    return `[\n${value
      .map((item) => `${childIndent}${serializeValue(item, childSchema, depth + 1)}`)
      .join(",\n")}\n${indent}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const properties = schema?.type === "object" ? schema.properties : {};
    return `{\n${entries
      .map(
        ([key, child]) =>
          `${childIndent}${JSON.stringify(key)}: ${serializeValue(child, properties[key], depth + 1)}`,
      )
      .join(",\n")}\n${indent}}`;
  }
  throw new TypeError("Component data contains an unsupported value");
}

export function serializeComponentReference(
  input: Pick<ComponentReference, "type" | "data"> | { type: string; data: ComponentData },
  schema?: ComponentSchema,
): string {
  return `<Component type=${JSON.stringify(input.type)} data={${serializeValue(input.data, schema, 0)}} />`;
}

export function canonicalizeComponentReferences(
  source: string,
  schemaLookup?: (type: string) => ComponentSchema | undefined,
): string {
  const { references } = parseArticleSource(source);
  let result = source;
  for (const reference of [...references].reverse()) {
    const replacement = serializeComponentReference(reference, schemaLookup?.(reference.type));
    result = `${result.slice(0, reference.start)}${replacement}${result.slice(reference.end)}`;
  }
  return result;
}
