import {
  Annotation,
  Transaction,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";

const externalSourceValue = Annotation.define<boolean>();

interface SourceChangeUpdate {
  docChanged: boolean;
  state: EditorState;
  transactions: readonly Transaction[];
}

export function externalSourceValueUpdate(
  documentLength: number,
  value: string,
): TransactionSpec {
  return {
    changes: { from: 0, to: documentLength, insert: value },
    annotations: [
      externalSourceValue.of(true),
      Transaction.addToHistory.of(false),
    ],
  };
}

export function publishSourceChange(
  update: SourceChangeUpdate,
  onChange: (value: string) => void,
): void {
  if (
    !update.docChanged ||
    update.transactions.some(
      (transaction) => transaction.annotation(externalSourceValue) === true,
    )
  ) {
    return;
  }
  onChange(update.state.doc.toString());
}
