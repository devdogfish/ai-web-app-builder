import ts from "typescript";

import type {
  ComponentData,
  ComponentDefinition,
  ComponentDefinitionInput,
  ComponentFieldSchema,
  ComponentSchema,
  ComponentUiHints,
} from "./contracts";
import { ComponentValidationError } from "./contracts";
import { componentTagFromName } from "./identity";
import { mergeComponentData } from "./merge-data";
import {
  assertValidComponentData,
  assertValidComponentSchema,
  MAX_COMPONENT_DESCRIPTION_LENGTH,
  MAX_COMPONENT_NAME_LENGTH,
  MAX_COMPONENT_TEMPLATE_BYTES,
} from "./schema";

export type PreparedComponentDefinition = Omit<
  ComponentDefinition,
  "id" | "createdAt" | "updatedAt" | "deletedAt"
>;

const SOURCE_FILE = "component.tsx";

export function prepareComponentDefinition(
  input: ComponentDefinitionInput,
): PreparedComponentDefinition {
  if (!input || typeof input !== "object" || typeof input.source !== "string") {
    throw sourceError("Component Source must be a TSX string.");
  }
  const source = input.source.trim();
  const sourceBytes = new TextEncoder().encode(source).byteLength;
  if (
    !source ||
    sourceBytes > MAX_COMPONENT_TEMPLATE_BYTES ||
    source.includes("\0")
  ) {
    throw sourceError(
      `Component Source must be non-empty and at most ${MAX_COMPONENT_TEMPLATE_BYTES} bytes.`,
    );
  }

  const file = ts.createSourceFile(
    SOURCE_FILE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  assertNoParseDiagnostics(file);
  assertSourceBoundary(file);

  const component = findDefaultComponent(file);
  const name = componentName(input.name, component.name!.text);
  const tag = componentTagFromName(name);
  const description = componentDescription(input.description, component);
  const declarations = collectTypeDeclarations(file);
  const parameter = component.parameters[0];
  if (!parameter?.type) {
    throw sourceError(
      "The default Component function must declare typed props.",
    );
  }
  if (component.parameters.length !== 1) {
    throw sourceError(
      "The default Component function must accept exactly one props parameter.",
    );
  }

  const schema = rootSchema(parameter.type, declarations);
  const uiHints = deriveUiHints(schema);
  const generatedDefaults = generatedValue(schema, false) as ComponentData;
  const explicitDefaults = extractParameterDefaults(parameter, file);
  const defaultData = mergeComponentData(
    generatedDefaults,
    explicitDefaults,
  ) as ComponentData;
  const sampleData = mergeComponentData(
    generatedValue(schema, true),
    explicitDefaults,
  ) as ComponentData;
  assertValidComponentSchema(schema);
  assertValidComponentData(schema, defaultData, "invalid_default_data");
  assertValidComponentData(schema, sampleData, "invalid_sample_data");

  const compiledSource = transpile(source);
  return {
    tag,
    name,
    description,
    source,
    compiledSource,
    schema,
    uiHints,
    defaultData,
    sampleData,
  };
}

function sourceError(message: string): ComponentValidationError {
  return new ComponentValidationError("invalid_source", message);
}

function assertNoParseDiagnostics(file: ts.SourceFile): void {
  const diagnostics = (
    file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if (diagnostics.length === 0) return;
  throw sourceError(formatDiagnostic(diagnostics[0]!, file));
}

function assertSourceBoundary(file: ts.SourceFile): void {
  if (/^\s*["']use client["'];?/m.test(file.text)) {
    throw sourceError(
      'Component Source cannot use the "use client" directive.',
    );
  }
  const problems: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
      problems.push("imports are not allowed");
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          ["require", "eval", "Function"].includes(node.expression.text)))
    ) {
      problems.push("dynamic code and imports are not allowed");
    }
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(file))) {
      problems.push(
        `React event prop ${node.name.getText(file)} is unavailable in static HTML; use inline Component Behavior instead`,
      );
    }
    if (ts.isCallExpression(node)) {
      const called = node.expression.getText(file);
      if (/^(?:React\.)?use[A-Z]/.test(called)) {
        problems.push(`React hook ${called} is unavailable in static HTML`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (problems.length > 0)
    throw sourceError([...new Set(problems)].join(". ") + ".");
}

function findDefaultComponent(file: ts.SourceFile): ts.FunctionDeclaration {
  const candidates = file.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword),
  );
  if (candidates.length !== 1 || !candidates[0]!.name) {
    throw sourceError(
      "Component Source must have exactly one named `export default function`.",
    );
  }
  const component = candidates[0]!;
  if (
    hasModifier(component, ts.SyntaxKind.AsyncKeyword) ||
    component.asteriskToken
  ) {
    throw sourceError("The default Component function must be synchronous.");
  }
  return component;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(
    ts
      .getModifiers(node as ts.HasModifiers)
      ?.some((item) => item.kind === kind),
  );
}

function componentName(
  value: string | undefined,
  functionName: string,
): string {
  const name = value === undefined ? humanize(functionName) : value.trim();
  if (!name || name.length > MAX_COMPONENT_NAME_LENGTH) {
    throw new ComponentValidationError(
      "invalid_name",
      `Component name must be between 1 and ${MAX_COMPONENT_NAME_LENGTH} characters.`,
    );
  }
  return name;
}

function componentDescription(
  value: string | undefined,
  component: ts.FunctionDeclaration,
): string {
  const docs = ts
    .getJSDocCommentsAndTags(component)
    .filter(ts.isJSDoc)
    .map((doc) =>
      typeof doc.comment === "string"
        ? doc.comment
        : (doc.comment?.map((part) => part.text).join("") ?? ""),
    )
    .join(" ")
    .trim();
  const fallback = humanize(component.name!.text);
  const description = value === undefined ? docs || fallback : value.trim();
  if (!description || description.length > MAX_COMPONENT_DESCRIPTION_LENGTH) {
    throw new ComponentValidationError(
      "invalid_description",
      `Component description must be between 1 and ${MAX_COMPONENT_DESCRIPTION_LENGTH} characters.`,
    );
  }
  return description;
}

function collectTypeDeclarations(
  file: ts.SourceFile,
): Map<string, ts.TypeNode> {
  const declarations = new Map<string, ts.TypeNode>();
  for (const statement of file.statements) {
    if (ts.isTypeAliasDeclaration(statement)) {
      declarations.set(statement.name.text, statement.type);
    } else if (ts.isInterfaceDeclaration(statement)) {
      if (statement.heritageClauses?.length) {
        throw sourceError(
          `Props interface ${statement.name.text} cannot extend another type.`,
        );
      }
      declarations.set(
        statement.name.text,
        ts.factory.createTypeLiteralNode(statement.members),
      );
    }
  }
  return declarations;
}

function rootSchema(
  type: ts.TypeNode,
  declarations: Map<string, ts.TypeNode>,
): ComponentSchema {
  const schema = fieldSchema(type, declarations, new Set(), "Props");
  if (schema.type !== "object") {
    throw sourceError("Component props must be an object type or interface.");
  }
  return schema;
}

function fieldSchema(
  type: ts.TypeNode,
  declarations: Map<string, ts.TypeNode>,
  seen: Set<string>,
  path: string,
): ComponentFieldSchema {
  if (ts.isParenthesizedTypeNode(type)) {
    return fieldSchema(type.type, declarations, seen, path);
  }
  if (type.kind === ts.SyntaxKind.StringKeyword) return { type: "string" };
  if (type.kind === ts.SyntaxKind.NumberKeyword) return { type: "number" };
  if (type.kind === ts.SyntaxKind.BooleanKeyword) return { type: "boolean" };
  if (ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)) {
    return {
      type: "choice",
      options: [
        { value: type.literal.text, label: humanize(type.literal.text) },
      ],
    };
  }
  if (ts.isArrayTypeNode(type)) {
    return {
      type: "array",
      items: fieldSchema(type.elementType, declarations, seen, `${path}[]`),
    };
  }
  if (ts.isUnionTypeNode(type)) {
    const values = type.types.flatMap((item) =>
      ts.isLiteralTypeNode(item) && ts.isStringLiteral(item.literal)
        ? [item.literal.text]
        : [],
    );
    if (values.length === type.types.length && values.length > 0) {
      return {
        type: "choice",
        options: values.map((value) => ({ value, label: humanize(value) })),
      };
    }
    throw sourceError(
      `${path} uses an unsupported union. Only string-literal unions are allowed.`,
    );
  }
  if (ts.isTypeLiteralNode(type)) {
    return objectSchema(type.members, declarations, seen, path);
  }
  if (ts.isTypeReferenceNode(type)) {
    const name = type.typeName.getText();
    if (name === "React.ReactNode" || name === "ReactNode")
      return { type: "html" };
    if (name === "ImageSource") return { type: "image" };
    if (name === "Array") {
      if (type.typeArguments?.length !== 1) {
        throw sourceError(`${path} Array must have exactly one item type.`);
      }
      return {
        type: "array",
        items: fieldSchema(
          type.typeArguments[0]!,
          declarations,
          seen,
          `${path}[]`,
        ),
      };
    }
    const resolved = declarations.get(name);
    if (!resolved) {
      throw sourceError(
        `${path} uses unsupported type ${name}. Use string, number, boolean, React.ReactNode, ImageSource, a string union, object, or array.`,
      );
    }
    if (seen.has(name))
      throw sourceError(`${path} contains recursive type ${name}.`);
    return fieldSchema(resolved, declarations, new Set(seen).add(name), path);
  }
  throw sourceError(`${path} uses unsupported type syntax ${type.getText()}.`);
}

function objectSchema(
  members: ts.NodeArray<ts.TypeElement>,
  declarations: Map<string, ts.TypeNode>,
  seen: Set<string>,
  path: string,
): ComponentSchema {
  const properties: Record<string, ComponentFieldSchema> = {};
  const required: string[] = [];
  for (const member of members) {
    if (!ts.isPropertySignature(member) || !member.type || !member.name) {
      throw sourceError(`${path} may contain only typed properties.`);
    }
    const name = propertyName(member.name, path);
    const childPath = path === "Props" ? name : `${path}.${name}`;
    const schema = fieldSchema(member.type, declarations, seen, childPath);
    const description = jsDocText(member);
    properties[name] = description ? { ...schema, description } : schema;
    if (!member.questionToken) required.push(name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

function propertyName(name: ts.PropertyName, path: string): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  throw sourceError(
    `${path} property names must be identifiers or string literals.`,
  );
}

function jsDocText(node: ts.Node): string {
  return ts
    .getJSDocCommentsAndTags(node)
    .filter(ts.isJSDoc)
    .map((doc) => (typeof doc.comment === "string" ? doc.comment : ""))
    .join(" ")
    .trim();
}

function deriveUiHints(schema: ComponentSchema): ComponentUiHints {
  const hints: ComponentUiHints = {};
  const visit = (
    field: ComponentFieldSchema,
    path: string,
    label: string,
    order: number,
  ): void => {
    if (path) {
      hints[path] = {
        label: humanize(label),
        ...(field.description ? { helpText: field.description } : {}),
        control: controlFor(field),
        order,
      };
    }
    if (field.type === "object") {
      Object.entries(field.properties).forEach(([name, child], index) =>
        visit(child, path ? `${path}.${name}` : name, name, index + 1),
      );
    } else if (field.type === "array") {
      visit(field.items, `${path}[]`, singular(label), 1);
    }
  };
  Object.entries(schema.properties).forEach(([name, field], index) =>
    visit(field, name, name, index + 1),
  );
  return hints;
}

function controlFor(
  field: ComponentFieldSchema,
): NonNullable<ComponentUiHints[string]["control"]> {
  switch (field.type) {
    case "html":
      return "rich-html";
    case "image":
      return "image";
    case "number":
      return "number";
    case "boolean":
      return "checkbox";
    case "choice":
      return "select";
    case "array":
      return "list";
    case "object":
      return "group";
    default:
      return "text";
  }
}

function generatedValue(
  schema: ComponentFieldSchema,
  sample: boolean,
): unknown {
  switch (schema.type) {
    case "string":
      return sample ? "Sample text" : "";
    case "html":
      return sample ? "<p>Sample content.</p>" : "";
    case "image":
      return sample ? "/images/sample.jpg" : "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "choice":
      return schema.options[0]?.value ?? "";
    case "array":
      return sample ? [generatedValue(schema.items, true)] : [];
    case "object":
      return Object.fromEntries(
        Object.entries(schema.properties).map(([name, child]) => [
          name,
          generatedValue(child, sample),
        ]),
      );
  }
}

function extractParameterDefaults(
  parameter: ts.ParameterDeclaration,
  file: ts.SourceFile,
): ComponentData {
  const constants = collectStaticConstants(file);
  const defaults: ComponentData = {};
  if (!ts.isObjectBindingPattern(parameter.name)) return defaults;
  for (const element of parameter.name.elements) {
    if (!element.initializer || !ts.isIdentifier(element.name)) continue;
    const name = element.propertyName
      ? propertyName(element.propertyName, "Props")
      : element.name.text;
    defaults[name] = staticValue(
      element.initializer,
      constants,
      `default ${name}`,
    );
  }
  return defaults;
}

function collectStaticConstants(
  file: ts.SourceFile,
): Map<string, ts.Expression> {
  const constants = new Map<string, ts.Expression>();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        constants.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return constants;
}

function staticValue(
  expression: ts.Expression,
  constants: Map<string, ts.Expression>,
  path: string,
  seen = new Set<string>(),
): unknown {
  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return staticValue(expression.expression, constants, path, seen);
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(expression)) {
    const value = staticValue(expression.operand, constants, path, seen);
    if (typeof value !== "number")
      throw sourceError(`${path} must be static data.`);
    if (expression.operator === ts.SyntaxKind.MinusToken) return -value;
    if (expression.operator === ts.SyntaxKind.PlusToken) return value;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((item, index) => {
      if (ts.isSpreadElement(item))
        throw sourceError(`${path}[${index}] cannot use spread.`);
      return staticValue(item, constants, `${path}[${index}]`, seen);
    });
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const result: Record<string, unknown> = {};
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw sourceError(
          `${path} defaults may contain only property assignments.`,
        );
      }
      const name = propertyName(property.name, path);
      result[name] = staticValue(
        property.initializer,
        constants,
        `${path}.${name}`,
        seen,
      );
    }
    return result;
  }
  if (ts.isIdentifier(expression)) {
    const resolved = constants.get(expression.text);
    if (!resolved || seen.has(expression.text)) {
      throw sourceError(
        `${path} must use static literals or a top-level const.`,
      );
    }
    return staticValue(
      resolved,
      constants,
      path,
      new Set(seen).add(expression.text),
    );
  }
  throw sourceError(`${path} must be JSON-compatible static data.`);
}

function transpile(source: string): string {
  const result = ts.transpileModule(source, {
    fileName: SOURCE_FILE,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      jsxFactory: "__jsx",
      jsxFragmentFactory: "__Fragment",
      esModuleInterop: false,
      isolatedModules: true,
      removeComments: false,
    },
  });
  const error = result.diagnostics?.find(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (error) throw sourceError(formatDiagnostic(error));
  return result.outputText;
}

function formatDiagnostic(
  diagnostic: ts.Diagnostic,
  file?: ts.SourceFile,
): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  const source = diagnostic.file ?? file;
  if (!source || diagnostic.start === undefined) return message;
  const point = source.getLineAndCharacterOfPosition(diagnostic.start);
  return `${message} (${point.line + 1}:${point.character + 1})`;
}

function humanize(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
  return spaced ? spaced[0]!.toUpperCase() + spaced.slice(1) : value;
}

function singular(value: string): string {
  if (/ies$/i.test(value)) return value.replace(/ies$/i, "y");
  if (/s$/i.test(value) && !/ss$/i.test(value)) return value.slice(0, -1);
  return "Item";
}
