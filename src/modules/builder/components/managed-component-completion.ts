import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import { htmlCompletionSource } from "@codemirror/lang-html";
import type { EditorView } from "@codemirror/view";

import type { ComponentSummary } from "@/modules/components/contracts";

export function componentReferenceSource(id: string): string {
  return `<Component id=${JSON.stringify(id)} data={{}} />`;
}

export function managedComponentCompletion(
  context: CompletionContext,
  summaries: readonly ComponentSummary[],
  onInsert: (id: string, source: string, start: number) => void,
): CompletionResult | null {
  const lineBeforeCursor = context.state.sliceDoc(
    context.state.doc.lineAt(context.pos).from,
    context.pos,
  );
  const match = lineBeforeCursor.match(/<([A-Za-z]*)$/);
  const typedTag = match?.[1] ?? "";
  if (!match || typedTag.length === 0) {
    return null;
  }

  const from = context.pos - typedTag.length;
  const normalizedTag = typedTag.toLowerCase();
  const genericTrigger = "component".startsWith(normalizedTag);
  const options: Completion[] = summaries
    .filter((summary) =>
      genericTrigger
        ? true
        : summary.tag.toLowerCase().startsWith(normalizedTag),
    )
    .map((summary) => ({
      label: summary.tag,
      displayLabel: summary.tag,
      detail: summary.description,
      type: "class",
      apply(
        view: EditorView,
        _completion: Completion,
        applyFrom: number,
        to: number,
      ) {
        const insert = componentReferenceSource(summary.id);
        const start = applyFrom - 1;
        view.dispatch({
          changes: { from: start, to, insert },
          selection: { anchor: start + insert.length },
        });
        onInsert(summary.id, view.state.doc.toString(), start);
      },
    }));

  if (options.length === 0) return null;

  return {
    from,
    options,
    filter: genericTrigger ? false : undefined,
    validFor: /^[A-Za-z]*$/,
  };
}

export function createArticleCompletionSource(
  getSummaries: () => readonly ComponentSummary[],
  onInsert: (id: string, source: string, start: number) => void,
): CompletionSource {
  return (context) =>
    managedComponentCompletion(context, getSummaries(), onInsert) ??
    htmlCompletionSource(context);
}
