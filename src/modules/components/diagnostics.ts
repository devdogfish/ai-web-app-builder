import { resolve } from "node:path";

import ts from "typescript";

import { prepareComponentDefinition } from "./authoring";

export interface ComponentSourceDiagnostic {
  from: number;
  to: number;
  severity: "error" | "warning";
  message: string;
  source: "TypeScript" | "Builder";
}

const COMPONENT_FILE = resolve("component.tsx");
const GLOBALS_FILE = resolve("component-authoring-globals.d.ts");
const AUTHORING_GLOBALS = `type ImageSource = string;`;

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  types: ["react"],
  strict: true,
  noEmit: true,
  skipLibCheck: true,
};

export function diagnoseComponentSource(
  source: string,
): ComponentSourceDiagnostic[] {
  const diagnostics = typeScriptDiagnostics(source);

  try {
    prepareComponentDefinition({ source });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Component Source.";
    const range = builderErrorRange(source, message);
    diagnostics.push({
      ...range,
      severity: "error",
      message,
      source: "Builder",
    });
  }

  return [
    ...new Map(
      diagnostics.map((diagnostic) => [
        `${diagnostic.from}:${diagnostic.to}:${diagnostic.message}`,
        diagnostic,
      ]),
    ).values(),
  ];
}

function typeScriptDiagnostics(source: string): ComponentSourceDiagnostic[] {
  const baseHost = ts.createCompilerHost(COMPILER_OPTIONS, true);
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists(fileName) {
      return (
        fileName === COMPONENT_FILE ||
        fileName === GLOBALS_FILE ||
        baseHost.fileExists(fileName)
      );
    },
    readFile(fileName) {
      if (fileName === COMPONENT_FILE) return source;
      if (fileName === GLOBALS_FILE) return AUTHORING_GLOBALS;
      return baseHost.readFile(fileName);
    },
    getSourceFile(
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    ) {
      if (fileName === COMPONENT_FILE) {
        return ts.createSourceFile(
          fileName,
          source,
          languageVersion,
          true,
          ts.ScriptKind.TSX,
        );
      }
      if (fileName === GLOBALS_FILE) {
        return ts.createSourceFile(
          fileName,
          AUTHORING_GLOBALS,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        );
      }
      return baseHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
    },
  };
  const program = ts.createProgram(
    [COMPONENT_FILE, GLOBALS_FILE],
    COMPILER_OPTIONS,
    host,
  );

  return ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        diagnostic.file?.fileName === COMPONENT_FILE &&
        (diagnostic.category === ts.DiagnosticCategory.Error ||
          diagnostic.category === ts.DiagnosticCategory.Warning),
    )
    .map((diagnostic) => {
      const from = Math.max(0, diagnostic.start ?? 0);
      const to = Math.min(
        source.length,
        from + Math.max(1, diagnostic.length ?? 1),
      );
      return {
        from,
        to,
        severity:
          diagnostic.category === ts.DiagnosticCategory.Warning
            ? "warning"
            : "error",
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        source: "TypeScript",
      } satisfies ComponentSourceDiagnostic;
    });
}

function builderErrorRange(
  source: string,
  message: string,
): Pick<ComponentSourceDiagnostic, "from" | "to"> {
  const location = message.match(/\((\d+):(\d+)\)$/);
  if (location) {
    const line = Number(location[1]);
    const column = Number(location[2]);
    const lines = source.split("\n");
    const from =
      lines
        .slice(0, Math.max(0, line - 1))
        .reduce((total, item) => total + item.length + 1, 0) +
      Math.max(0, column - 1);
    return { from, to: Math.min(source.length, from + 1) };
  }

  const importMatch = /^\s*import\b.*$/m.exec(source);
  if (
    message.includes("imports are not allowed") &&
    importMatch?.index !== undefined
  ) {
    return {
      from: importMatch.index,
      to: importMatch.index + importMatch[0].length,
    };
  }

  return { from: 0, to: Math.min(source.length, 1) };
}
