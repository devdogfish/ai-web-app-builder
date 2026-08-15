import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

import {
  externalSourceValueUpdate,
  publishSourceChange,
} from "../components/source-editor-sync";

describe("SourceEditor synchronization", () => {
  it("does not publish externally synchronized values as user edits", () => {
    const initial = EditorState.create({ doc: "before" });
    const transaction = initial.update(
      externalSourceValueUpdate(initial.doc.length, "after"),
    );
    const onChange = vi.fn();

    publishSourceChange(
      {
        docChanged: transaction.docChanged,
        state: transaction.state,
        transactions: [transaction],
      },
      onChange,
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it("publishes user edits", () => {
    const initial = EditorState.create({ doc: "before" });
    const transaction = initial.update({
      changes: { from: 0, to: initial.doc.length, insert: "after" },
      userEvent: "input.type",
    });
    const onChange = vi.fn();

    publishSourceChange(
      {
        docChanged: transaction.docChanged,
        state: transaction.state,
        transactions: [transaction],
      },
      onChange,
    );

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("after");
  });
});
