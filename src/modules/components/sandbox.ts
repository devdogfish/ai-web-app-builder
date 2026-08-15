import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";

import type {
  ComponentData,
  ComponentDefinition,
  ComponentFieldSchema,
} from "./contracts";
import { assertValidComponentData } from "./schema";

export class ComponentSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComponentSandboxError";
  }
}

const RENDER_TIMEOUT_MS = 750;
const RENDER_MEMORY_BYTES = 64 * 1024 * 1024;
const RENDER_STACK_BYTES = 1024 * 1024;

const quickJsModule = getQuickJS();

const STATIC_JSX_RUNTIME = String.raw`
const __Fragment = Symbol("Fragment");
const __VOID = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

function __jsx(type, props, ...children) {
  const normalized = props || {};
  if (type === __Fragment) return children;
  if (typeof type === "function") {
    const value = children.length === 0 ? undefined : children.length === 1 ? children[0] : children;
    return type({ ...normalized, ...(value === undefined ? {} : { children: value }) });
  }
  if (typeof type !== "string") throw new Error("JSX elements must use HTML tags or local function Components.");
  return { __componentElement: true, type, props: normalized, children };
}

function __escapeText(value) {
  return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function __escapeAttribute(value) {
  return __escapeText(value).replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function __attributeName(name) {
  if (name === "className") return "class";
  if (name === "htmlFor") return "for";
  return name.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
}

function __style(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The style prop must be a string or object.");
  }
  return Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && item !== false)
    .map(([name, item]) => __attributeName(name) + ":" + String(item))
    .join(";");
}

function __render(node, parentTag) {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (Array.isArray(node)) return node.map(item => __render(item, parentTag)).join("");
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
    return parentTag === "script" || parentTag === "style" ? String(node) : __escapeText(node);
  }
  if (typeof node === "object" && node.__componentHtml === true) return String(node.value || "");
  if (!node || typeof node !== "object" || node.__componentElement !== true) {
    throw new Error("Component returned an unsupported JSX value.");
  }

  const tag = node.type.toLowerCase();
  if (!/^[a-z][a-z0-9:-]*$/.test(tag)) throw new Error("Invalid HTML tag " + node.type + ".");
  let attributes = "";
  let rawHtml = null;
  for (const [sourceName, sourceValue] of Object.entries(node.props || {})) {
    if (sourceName === "children" || sourceName === "key" || sourceName === "ref") continue;
    if (sourceName === "dangerouslySetInnerHTML") {
      if (!sourceValue || typeof sourceValue.__html !== "string") {
        throw new Error("dangerouslySetInnerHTML must contain a string __html value.");
      }
      rawHtml = sourceValue.__html;
      continue;
    }
    if (/^on[A-Z]/.test(sourceName)) {
      throw new Error("React event props are unavailable in static Component output.");
    }
    if (sourceValue === null || sourceValue === undefined || sourceValue === false) continue;
    const name = __attributeName(sourceName);
    if (!/^[a-zA-Z_:][a-zA-Z0-9:._-]*$/.test(name)) throw new Error("Invalid HTML attribute " + name + ".");
    if (sourceValue === true) {
      attributes += " " + name;
      continue;
    }
    if (typeof sourceValue === "function" || typeof sourceValue === "object" && sourceName !== "style") {
      throw new Error("HTML attribute " + sourceName + " must be scalar.");
    }
    const value = sourceName === "style" ? __style(sourceValue) : String(sourceValue);
    attributes += " " + name + '=\"' + __escapeAttribute(value) + '\"';
  }
  if (__VOID.has(tag)) return "<" + tag + attributes + ">";
  const content = rawHtml === null ? __render(node.children, tag) : rawHtml;
  return "<" + tag + attributes + ">" + content + "</" + tag + ">";
}
`;

export async function renderSandboxedComponent(
  definition: Pick<
    ComponentDefinition,
    "tag" | "compiledSource" | "schema" | "defaultData"
  >,
  sourceData: ComponentData,
): Promise<string> {
  const data = mergeComponentData(definition.defaultData, sourceData);
  assertValidComponentData(definition.schema, data);
  const props = prepareRuntimeProps(definition.schema, data);
  const program = `${STATIC_JSX_RUNTIME}
const exports = {};
const module = { exports };
${definition.compiledSource}
const __Component = module.exports.default || exports.default;
if (typeof __Component !== "function") throw new Error("Default export is not a Component function.");
__render(__Component(${JSON.stringify(props)}), null);`;

  try {
    const quickJS = await quickJsModule;
    const result = quickJS.evalCode(program, {
      shouldInterrupt: shouldInterruptAfterDeadline(
        Date.now() + RENDER_TIMEOUT_MS,
      ),
      memoryLimitBytes: RENDER_MEMORY_BYTES,
      maxStackSizeBytes: RENDER_STACK_BYTES,
    });
    if (typeof result !== "string") {
      throw new Error("Component did not render an HTML string.");
    }
    return result;
  } catch (error) {
    throw new ComponentSandboxError(
      `Component ${definition.tag} failed inside the render sandbox: ${errorMessage(error)}`,
    );
  }
}

function prepareRuntimeProps(
  schema: ComponentFieldSchema,
  value: unknown,
): unknown {
  if (schema.type === "html") {
    return {
      __componentHtml: true,
      value: typeof value === "string" ? value : "",
    };
  }
  if (schema.type === "array") {
    return Array.isArray(value)
      ? value.map((item) => prepareRuntimeProps(schema.items, item))
      : [];
  }
  if (schema.type === "object") {
    const object =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      Object.entries(schema.properties).map(([name, child]) => [
        name,
        prepareRuntimeProps(child, object[name]),
      ]),
    );
  }
  return value;
}

export function mergeComponentData(
  defaults: ComponentData,
  provided: ComponentData,
): ComponentData;
export function mergeComponentData(
  defaults: unknown,
  provided: unknown,
): unknown;
export function mergeComponentData(
  defaults: unknown,
  provided: unknown,
): unknown {
  if (
    defaults &&
    provided &&
    typeof defaults === "object" &&
    typeof provided === "object" &&
    !Array.isArray(defaults) &&
    !Array.isArray(provided)
  ) {
    const result: Record<string, unknown> = {
      ...(defaults as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(
      provided as Record<string, unknown>,
    )) {
      result[key] = mergeComponentData(result[key], value);
    }
    return result;
  }
  return provided;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown sandbox error";
  }
}
