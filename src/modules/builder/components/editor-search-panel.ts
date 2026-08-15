import type { Extension } from "@codemirror/state";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  setSearchQuery,
} from "@codemirror/search";
import {
  runScopeHandlers,
  type EditorView,
  type Panel,
  type ViewUpdate,
} from "@codemirror/view";

const ICON_PATHS = {
  close: ["M18 6 6 18", "m6 6 12 12"],
  next: ["m6 9 6 6 6-6"],
  previous: ["m18 15-6-6-6 6"],
  replace: ["M5 12h14", "m13-6 6 6-6 6"],
  replaceAll: ["M4 7h11", "m12-3 3 3-3 3", "M20 17H9", "m-1 3-3-3 3-3"],
  toggleReplace: ["m9 18 6-6-6-6"],
} as const;

type SearchOption = "caseSensitive" | "regexp" | "wholeWord";

export function vscodeSearchPanel(): Extension {
  return search({
    top: true,
    createPanel: (view) => new VscodeSearchPanel(view),
  });
}

class VscodeSearchPanel implements Panel {
  readonly top = true;
  readonly dom: HTMLElement;

  private query: SearchQuery;
  private readonly searchField: HTMLInputElement;
  private readonly replaceField: HTMLInputElement;
  private readonly replaceRow: HTMLDivElement;
  private readonly matchCount: HTMLSpanElement;
  private readonly replaceToggle?: HTMLButtonElement;
  private readonly optionButtons: Record<SearchOption, HTMLButtonElement>;
  private replaceOpen = false;

  constructor(private readonly view: EditorView) {
    this.query = getSearchQuery(view.state);
    this.searchField = createInput("Find", "search");
    this.searchField.setAttribute("main-field", "true");
    this.replaceField = createInput("Replace", "replace");

    this.optionButtons = {
      caseSensitive: createOptionButton("Match case", "Aa", () =>
        this.toggleOption("caseSensitive"),
      ),
      wholeWord: createOptionButton("Match whole word", "ab", () =>
        this.toggleOption("wholeWord"),
      ),
      regexp: createOptionButton("Use regular expression", ".*", () =>
        this.toggleOption("regexp"),
      ),
    };

    const searchFieldWrap = document.createElement("div");
    searchFieldWrap.className = "cm-search-field-wrap";
    searchFieldWrap.append(this.searchField);

    const options = document.createElement("div");
    options.className = "cm-search-options";
    options.append(
      this.optionButtons.caseSensitive,
      this.optionButtons.wholeWord,
      this.optionButtons.regexp,
    );
    searchFieldWrap.append(options);

    const findRow = document.createElement("div");
    findRow.className = "cm-search-row cm-search-find-row";

    if (!view.state.readOnly) {
      this.replaceToggle = createIconButton(
        "Toggle replace",
        ICON_PATHS.toggleReplace,
        this.toggleReplace,
      );
      this.replaceToggle.classList.add("cm-search-replace-toggle");
      this.replaceToggle.setAttribute("aria-expanded", "false");
      findRow.append(this.replaceToggle);
    } else {
      findRow.classList.add("cm-search-find-row-readonly");
    }

    this.matchCount = document.createElement("span");
    this.matchCount.className = "cm-search-match-count";
    this.matchCount.setAttribute("aria-live", "polite");

    findRow.append(
      searchFieldWrap,
      this.matchCount,
      createIconButton("Previous match", ICON_PATHS.previous, () =>
        findPrevious(view),
      ),
      createIconButton("Next match", ICON_PATHS.next, () => findNext(view)),
      createIconButton("Close find", ICON_PATHS.close, () =>
        closeSearchPanel(view),
      ),
    );

    this.replaceRow = document.createElement("div");
    this.replaceRow.className = "cm-search-row cm-search-replace-row";
    this.replaceRow.hidden = true;
    if (!view.state.readOnly) {
      const spacer = document.createElement("span");
      spacer.className = "cm-search-replace-spacer";
      const countSpacer = document.createElement("span");
      countSpacer.className = "cm-search-match-spacer";
      this.replaceRow.append(
        spacer,
        this.replaceField,
        countSpacer,
        createIconButton("Replace next", ICON_PATHS.replace, () =>
          replaceNext(view),
        ),
        createIconButton("Replace all", ICON_PATHS.replaceAll, () =>
          replaceAll(view),
        ),
      );
    }

    this.dom = document.createElement("div");
    this.dom.className = "cm-vscode-search";
    this.dom.addEventListener("keydown", this.handleKeyDown);
    this.dom.append(findRow);
    if (!view.state.readOnly) this.dom.append(this.replaceRow);

    this.searchField.addEventListener("input", this.commit);
    this.replaceField.addEventListener("input", this.commit);
    this.syncFields(this.query);
  }

  mount() {
    this.searchField.select();
  }

  update(update: ViewUpdate) {
    const query = getSearchQuery(update.state);
    if (!query.eq(this.query)) this.syncFields(query);
    else this.updateMatchCount();
  }

  destroy() {
    this.dom.removeEventListener("keydown", this.handleKeyDown);
    this.searchField.removeEventListener("input", this.commit);
    this.replaceField.removeEventListener("input", this.commit);
  }

  private readonly commit = () => {
    const query = new SearchQuery({
      search: this.searchField.value,
      replace: this.replaceField.value,
      caseSensitive: this.query.caseSensitive,
      wholeWord: this.query.wholeWord,
      regexp: this.query.regexp,
    });
    if (query.eq(this.query)) return;
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (runScopeHandlers(this.view, event, "search-panel")) {
      event.preventDefault();
      return;
    }
    if (event.key !== "Enter") return;

    if (event.target === this.searchField) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(this.view);
    } else if (event.target === this.replaceField) {
      event.preventDefault();
      replaceNext(this.view);
    }
  };

  private toggleOption(option: SearchOption) {
    const query = new SearchQuery({
      search: this.searchField.value,
      replace: this.replaceField.value,
      caseSensitive:
        option === "caseSensitive"
          ? !this.query.caseSensitive
          : this.query.caseSensitive,
      wholeWord:
        option === "wholeWord" ? !this.query.wholeWord : this.query.wholeWord,
      regexp: option === "regexp" ? !this.query.regexp : this.query.regexp,
    });
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    this.syncFields(query);
    this.searchField.focus();
  }

  private readonly toggleReplace = () => {
    this.replaceOpen = !this.replaceOpen;
    this.replaceRow.hidden = !this.replaceOpen;
    this.dom.classList.toggle("cm-search-replace-open", this.replaceOpen);
    this.replaceToggle?.setAttribute("aria-expanded", String(this.replaceOpen));
    if (this.replaceOpen) this.replaceField.focus();
  };

  private syncFields(query: SearchQuery) {
    this.query = query;
    if (this.searchField.value !== query.search)
      this.searchField.value = query.search;
    if (this.replaceField.value !== query.replace)
      this.replaceField.value = query.replace;
    this.optionButtons.caseSensitive.setAttribute(
      "aria-pressed",
      String(query.caseSensitive),
    );
    this.optionButtons.wholeWord.setAttribute(
      "aria-pressed",
      String(query.wholeWord),
    );
    this.optionButtons.regexp.setAttribute(
      "aria-pressed",
      String(query.regexp),
    );
    this.updateMatchCount();
  }

  private updateMatchCount() {
    if (!this.query.valid || !this.query.search) {
      this.matchCount.textContent = "";
      return;
    }

    const selection = this.view.state.selection.main;
    let total = 0;
    let current = 0;
    const cursor = this.query.getCursor(this.view.state);
    for (let next = cursor.next(); !next.done; next = cursor.next()) {
      const match = next.value;
      total += 1;
      if (match.from <= selection.from) current = total;
    }
    if (total === 0) {
      this.matchCount.textContent = "No results";
      return;
    }
    this.matchCount.textContent = `${Math.max(current, 1)} of ${total}`;
  }
}

function createInput(placeholder: string, name: string) {
  const input = document.createElement("input");
  input.className = "cm-search-input";
  input.name = name;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", placeholder);
  input.autocomplete = "off";
  input.spellcheck = false;
  return input;
}

function createOptionButton(label: string, text: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-search-option";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", "false");
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function createIconButton(
  label: string,
  paths: readonly string[],
  onClick: () => void,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-search-action";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  button.append(createIcon(paths));
  return button;
}

function createIcon(paths: readonly string[]) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const value of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", value);
    svg.append(path);
  }
  return svg;
}
