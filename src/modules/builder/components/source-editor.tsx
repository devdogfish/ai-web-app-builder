"use client";

import { basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { unifiedMergeView } from "@codemirror/merge";
import { redo, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { vscodeSearchPanel } from "@/modules/builder/components/editor-search-panel";
import { cn } from "@/modules/builder/utils";

export interface SourceEditorHandle {
  undo: () => void;
  redo: () => void;
  find: () => void;
}

export const SourceEditor = forwardRef<
  SourceEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    original?: string;
    readOnly?: boolean;
    ariaLabel?: string;
    className?: string;
  }
>(function SourceEditor(
  {
    value,
    onChange,
    original,
    readOnly = false,
    ariaLabel = "HTML source",
    className,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

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
    const extensions = [
      basicSetup,
      html(),
      vscodeSearchPanel(),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          height: "100%",
          position: "relative",
          backgroundColor: "transparent",
        },
        ".cm-scroller": { overflow: "auto" },
        ".cm-content": { paddingBlock: "0.75rem" },
        ".cm-gutters": {
          backgroundColor: "transparent",
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
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
    ];
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
  }, [ariaLabel, original, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      className={cn(
        "h-full min-h-96 overflow-hidden bg-background lg:min-h-0",
        className,
      )}
    />
  );
});
