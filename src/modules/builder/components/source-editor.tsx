"use client";

import { basicSetup } from "codemirror";
import { autocompletion } from "@codemirror/autocomplete";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { unifiedMergeView } from "@codemirror/merge";
import { indentWithTab, redo, undo } from "@codemirror/commands";
import {
  linter,
  lintGutter,
  type Diagnostic as CodeMirrorDiagnostic,
} from "@codemirror/lint";
import { openSearchPanel } from "@codemirror/search";
import {
  EditorState,
  Prec,
  RangeSetBuilder,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { vscodeSearchPanel } from "@/modules/builder/components/editor-search-panel";
import { createArticleCompletionSource } from "@/modules/builder/components/managed-component-completion";
import {
  findManagedComponentReferenceRanges,
  managedComponentDisplayTag,
  type ManagedComponentReferenceRange,
} from "@/modules/builder/components/managed-component-source";
import {
  externalSourceValueUpdate,
  publishSourceChange,
} from "@/modules/builder/components/source-editor-sync";
import { cn } from "@/modules/builder/utils";
import type { ComponentSummary } from "@/modules/components/contracts";

export {
  findManagedComponentReferenceRanges,
  readManagedComponentReference,
  type ManagedComponentReferenceRange,
} from "@/modules/builder/components/managed-component-source";

export interface SourceEditorHandle {
  undo: () => void;
  redo: () => void;
  find: () => void;
}

export type SourceEditorLanguage = "html" | "tsx";

export type SourceEditorDiagnostic = Pick<
  CodeMirrorDiagnostic,
  "from" | "to" | "severity" | "message" | "source"
>;

const EMPTY_COMPONENT_SUMMARIES: readonly ComponentSummary[] = [];

class ManagedComponentWidget extends WidgetType {
  constructor(
    readonly reference: ManagedComponentReferenceRange,
    readonly tag: string,
    readonly onClick: (reference: ManagedComponentReferenceRange) => void,
    readonly disabled: boolean,
  ) {
    super();
  }

  eq(other: ManagedComponentWidget) {
    return (
      other.reference.id === this.reference.id &&
      other.tag === this.tag &&
      other.reference.index === this.reference.index &&
      other.disabled === this.disabled &&
      other.onClick === this.onClick
    );
  }

  toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-managed-component";
    button.disabled = this.disabled;
    button.setAttribute("aria-label", `Edit managed ${this.tag} Component`);

    const open = document.createElement("span");
    open.className = "cm-managed-component__punctuation";
    open.textContent = "<";

    const tag = document.createElement("span");
    tag.className = "cm-managed-component__name";
    tag.textContent = this.tag;

    const close = document.createElement("span");
    close.className = "cm-managed-component__punctuation";
    close.textContent = " />";

    button.append(open, tag, close);
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onClick(this.reference);
    });
    return button;
  }

  ignoreEvent() {
    return true;
  }
}

function managedComponentWidgets(
  onClick: (reference: ManagedComponentReferenceRange) => void,
  disabled: boolean,
  summaries: readonly ComponentSummary[],
): Extension {
  const decorations = StateField.define<DecorationSet>({
    create(state) {
      return buildManagedComponentDecorations(
        state,
        onClick,
        disabled,
        summaries,
      );
    },
    update(current, transaction) {
      if (!transaction.docChanged) return current;
      return buildManagedComponentDecorations(
        transaction.state,
        onClick,
        disabled,
        summaries,
      );
    },
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field)),
    ],
  });

  return [
    decorations,
    EditorView.theme({
      ".cm-managed-component": {
        display: "inline",
        maxWidth: "100%",
        appearance: "none",
        border: "0",
        borderRadius: "0.125rem",
        backgroundColor: "transparent",
        color: "inherit",
        padding: "0",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: "0.8125rem",
        fontWeight: "500",
        lineHeight: "inherit",
        cursor: "pointer",
      },
      ".cm-managed-component__punctuation": {
        color: "var(--muted-foreground)",
      },
      ".cm-managed-component__name": {
        color: "var(--foreground)",
        fontWeight: "650",
      },
      ".cm-managed-component:hover": {
        textDecorationLine: "underline",
        textDecorationColor: "var(--ring)",
        textUnderlineOffset: "0.2em",
      },
      ".cm-managed-component:focus-visible": {
        outline: "2px solid var(--ring)",
        outlineOffset: "2px",
      },
      ".cm-managed-component:disabled": {
        cursor: "default",
        opacity: "0.65",
      },
    }),
  ];
}

function buildManagedComponentDecorations(
  state: EditorState,
  onClick: (reference: ManagedComponentReferenceRange) => void,
  disabled: boolean,
  summaries: readonly ComponentSummary[],
) {
  const builder = new RangeSetBuilder<Decoration>();
  const references = findManagedComponentReferenceRanges(state.doc.toString());
  for (const reference of references) {
    const tag = managedComponentDisplayTag(reference.id, summaries);
    builder.add(
      reference.from,
      reference.to,
      Decoration.replace({
        widget: new ManagedComponentWidget(reference, tag, onClick, disabled),
      }),
    );
  }
  return builder.finish();
}

export const SourceEditor = forwardRef<
  SourceEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    original?: string;
    readOnly?: boolean;
    id?: string;
    ariaLabel?: string;
    className?: string;
    language?: SourceEditorLanguage;
    componentSummaries?: readonly ComponentSummary[];
    onSave?: (value: string) => void;
    onLint?: (value: string) => Promise<readonly SourceEditorDiagnostic[]>;
    onManagedComponentClick?: (
      reference: ManagedComponentReferenceRange,
    ) => void;
    onManagedComponentInsert?: (
      id: string,
      source: string,
      start: number,
    ) => void;
  }
>(function SourceEditor(
  {
    value,
    onChange,
    original,
    readOnly = false,
    id,
    ariaLabel = "HTML source",
    className,
    language = "html",
    componentSummaries = EMPTY_COMPONENT_SUMMARIES,
    onSave,
    onLint,
    onManagedComponentClick,
    onManagedComponentInsert,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onManagedComponentClickRef = useRef(onManagedComponentClick);
  const onManagedComponentInsertRef = useRef(onManagedComponentInsert);
  const onSaveRef = useRef(onSave);
  const onLintRef = useRef(onLint);
  const componentSummariesRef = useRef(componentSummaries);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  onManagedComponentClickRef.current = onManagedComponentClick;
  onManagedComponentInsertRef.current = onManagedComponentInsert;
  onSaveRef.current = onSave;
  onLintRef.current = onLint;
  componentSummariesRef.current = componentSummaries;
  valueRef.current = value;
  const hasManagedComponentClick = onManagedComponentClick !== undefined;
  const hasSave = onSave !== undefined;
  const hasLint = onLint !== undefined;
  const componentCatalogKey = componentSummaries
    .map((summary) => `${summary.id}:${summary.tag}`)
    .join("\0");

  useImperativeHandle(ref, () => ({
    undo: () => void (viewRef.current && undo(viewRef.current)),
    redo: () => void (viewRef.current && redo(viewRef.current)),
    find: () => {
      const view = viewRef.current;
      if (!view) return;

      openSearchPanel(view);
      requestAnimationFrame(() => {
        if (viewRef.current !== view) return;
        const searchField = view.dom.querySelector<HTMLInputElement>(
          '.cm-vscode-search input[main-field="true"]',
        );
        searchField?.focus();
        searchField?.select();
      });
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    const extensions: Extension[] = [
      basicSetup,
      Prec.highest(keymap.of([indentWithTab])),
      language === "tsx"
        ? javascript({ typescript: true, jsx: true })
        : html({ selfClosingTags: true }),
      vscodeSearchPanel(),
      EditorView.theme({
        "&": {
          height: "100%",
          position: "relative",
          backgroundColor: "transparent",
        },
        ".cm-scroller": { overflow: "auto" },
        ".cm-content": { paddingBlock: "0.75rem" },
        ".cm-gutters": {
          backgroundColor: "var(--background)",
          borderRight: "1px solid var(--border)",
        },
        ".cm-panels-top": {
          position: "absolute",
          top: "0",
          right: "0.875rem",
          left: "auto",
          zIndex: "20",
          width: "min(26rem, calc(100% - 1rem))",
          border: "0",
          backgroundColor: "transparent",
        },
        ".cm-panel.cm-vscode-search": {
          boxSizing: "border-box",
          width: "100%",
          padding: "0.25rem",
          border: "0",
          borderRadius: "0 0 0.1875rem 0.1875rem",
          backgroundColor: "var(--muted)",
          color: "var(--foreground)",
          boxShadow:
            "0 2px 8px color-mix(in oklab, var(--foreground) 24%, transparent)",
        },
        ".cm-search-row": {
          display: "grid",
          gridTemplateColumns:
            "1.25rem minmax(8rem, 1fr) 4.5rem repeat(3, 1.375rem)",
          minHeight: "1.625rem",
          alignItems: "center",
          gap: "0.125rem",
        },
        ".cm-search-find-row-readonly": {
          gridTemplateColumns: "minmax(8rem, 1fr) 4.5rem repeat(3, 1.375rem)",
        },
        ".cm-search-replace-row": {
          marginTop: "0.125rem",
          gridTemplateColumns:
            "1.25rem minmax(8rem, 1fr) 4.5rem repeat(2, 1.375rem) 1.375rem",
        },
        ".cm-search-replace-row[hidden]": {
          display: "none",
        },
        ".cm-search-field-wrap": {
          position: "relative",
          minWidth: "0",
        },
        ".cm-search-input": {
          boxSizing: "border-box",
          width: "100%",
          height: "1.625rem",
          minWidth: "0",
          border: "1px solid var(--input)",
          borderRadius: "0.125rem",
          outline: "none",
          backgroundColor: "var(--background)",
          color: "var(--foreground)",
          padding: "0 0.375rem",
          fontFamily: "var(--font-sans)",
          fontSize: "0.75rem",
        },
        ".cm-search-field-wrap .cm-search-input": {
          paddingRight: "4.125rem",
        },
        ".cm-search-input:focus": {
          borderColor: "var(--ring)",
          boxShadow: "inset 0 0 0 1px var(--ring)",
        },
        ".cm-search-options": {
          position: "absolute",
          top: "50%",
          right: "0.0625rem",
          display: "flex",
          gap: "0",
          transform: "translateY(-50%)",
        },
        ".cm-search-option, .cm-search-action": {
          display: "inline-flex",
          width: "1.375rem",
          height: "1.375rem",
          alignItems: "center",
          justifyContent: "center",
          border: "0",
          borderRadius: "0.1875rem",
          outline: "none",
          backgroundColor: "transparent",
          color: "var(--muted-foreground)",
          padding: "0",
          fontFamily: "var(--font-sans)",
          fontSize: "0.625rem",
          fontWeight: "500",
          cursor: "pointer",
        },
        ".cm-search-option:hover, .cm-search-action:hover, .cm-search-option[aria-pressed=true]":
          {
            backgroundColor: "var(--muted)",
            color: "var(--foreground)",
          },
        ".cm-search-option:focus-visible, .cm-search-action:focus-visible": {
          boxShadow: "inset 0 0 0 1px var(--ring)",
        },
        ".cm-search-action svg": {
          width: "0.875rem",
          height: "0.875rem",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "1.8",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        },
        ".cm-search-replace-toggle svg": {
          transition: "transform 100ms ease",
        },
        ".cm-search-replace-open .cm-search-replace-toggle svg": {
          transform: "rotate(90deg)",
        },
        ".cm-search-match-count": {
          overflow: "hidden",
          color: "var(--muted-foreground)",
          fontFamily: "var(--font-sans)",
          fontSize: "0.6875rem",
          lineHeight: "1",
          textAlign: "center",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
        ".cm-searchMatch": {
          backgroundColor: "color-mix(in oklab, #facc15 36%, transparent)",
        },
        ".cm-searchMatch.cm-searchMatch-selected": {
          backgroundColor: "color-mix(in oklab, #f97316 34%, transparent)",
          outline: "1px solid color-mix(in oklab, #f97316 58%, transparent)",
        },
      }),
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
      EditorView.updateListener.of((update) => {
        publishSourceChange(update, onChangeRef.current);
      }),
    ];
    if (language === "html") {
      extensions.push(
        autocompletion({
          override: [
            createArticleCompletionSource(
              () => componentSummariesRef.current,
              (componentId, source, start) =>
                onManagedComponentInsertRef.current?.(
                  componentId,
                  source,
                  start,
                ),
            ),
          ],
        }),
      );
    }
    if (language === "tsx" && hasLint) {
      extensions.push(
        lintGutter(),
        linter(
          async (view) =>
            (await onLintRef.current?.(view.state.doc.toString())) ?? [],
          { delay: 350 },
        ),
      );
    }
    if (language === "html" && hasManagedComponentClick) {
      extensions.push(
        managedComponentWidgets(
          (reference) => onManagedComponentClickRef.current?.(reference),
          readOnly,
          componentSummariesRef.current,
        ),
      );
    }
    if (original !== undefined) {
      extensions.push(unifiedMergeView({ original, mergeControls: false }));
    }
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({ doc: valueRef.current, extensions }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [
    ariaLabel,
    componentCatalogKey,
    hasManagedComponentClick,
    hasLint,
    hasSave,
    language,
    original,
    readOnly,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasSave) return;

    function saveOnShortcut(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }
      event.preventDefault();
      const view = viewRef.current;
      if (view) onSaveRef.current?.(view.state.doc.toString());
    }

    host.addEventListener("keydown", saveOnShortcut, { capture: true });
    return () =>
      host.removeEventListener("keydown", saveOnShortcut, { capture: true });
  }, [hasSave]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch(externalSourceValueUpdate(view.state.doc.length, value));
  }, [value]);

  return (
    <div
      id={id}
      ref={hostRef}
      className={cn(
        "h-full min-h-96 overflow-hidden bg-background lg:min-h-0",
        className,
      )}
    />
  );
});
