import { EditorSelection, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { FIND_CURRENT_CLASS, FIND_MARK_TAG, FIND_MATCH_CLASS } from "../../../../../utils/marked-config.js";
import type { FindQuery } from "../../../../common/find/find.types.js";
import { getSelectedText } from "../../markdown-commands.js";
import { findTableAround } from "../../table-commands.js";
import { isTableCellActive } from "../table/table-cell-state.js";
import { ACTIVE_TABLE_CELL_CLASS } from "../table/table-widget.js";
import { findStateField, getFindState, setFindCurrent, setFindQuery } from "./find-state.js";

const MATCH_MARK = Decoration.mark({ class: FIND_MATCH_CLASS, tagName: FIND_MARK_TAG });
const CURRENT_MARK = Decoration.mark({ class: FIND_CURRENT_CLASS, tagName: FIND_MARK_TAG });
const LINE_BREAK = "\n";

/** Marks every match in the visible ranges; a table draws its own cells' marks */
class FindHighlightPlugin {
  public decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  public update(update: ViewUpdate): void {
    if (update.viewportChanged || getFindState(update.startState) !== getFindState(update.state)) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const { matches, currentIndex } = getFindState(view.state);
    const decorations: Range<Decoration>[] = [];

    matches.forEach((match, index) => {
      const isVisible = view.visibleRanges.some(
        (visibleRange) => match.end > visibleRange.from && match.start < visibleRange.to
      );

      if (isVisible) {
        decorations.push((index === currentIndex ? CURRENT_MARK : MATCH_MARK).range(match.start, match.end));
      }
    });

    return Decoration.set(decorations);
  }
}

/**
 * Moves the selection onto the match and scrolls it into view, which reveals its syntax as a click would.
 * A match in a table puts the cursor at its start, so the table makes the cell under it active.
 */
function revealFindMatch(view: EditorView, index: number): void {
  const match = getFindState(view.state).matches[index];

  if (!match) {
    return;
  }

  view.dispatch({
    selection: findTableAround(view.state, match.start)
      ? EditorSelection.cursor(match.start)
      : EditorSelection.range(match.start, match.end),
    effects: [setFindCurrent.of(index), EditorView.scrollIntoView(match.start, { y: "center" })],
  });
}

/** Searches the source for `query`, or clears the search; a new query starts at the cursor and reveals its match */
export function applyFindQuery(view: EditorView, query: FindQuery | undefined): void {
  view.dispatch({ effects: setFindQuery.of(query) });

  const { currentIndex } = getFindState(view.state);

  if (currentIndex !== undefined) {
    revealFindMatch(view, currentIndex);
  }
}

/** Reveals the match `offset` steps from the current one, wrapping */
export function stepFind(view: EditorView, offset: number): void {
  const { matches, currentIndex } = getFindState(view.state);

  if (currentIndex !== undefined) {
    revealFindMatch(view, (currentIndex + offset + matches.length) % matches.length);
  }
}

/** The non-empty single-line selection to start a query from; in an active table cell, its own selection */
export function getFindSelectionText(view: EditorView): string | undefined {
  if (!isTableCellActive(view.state)) {
    const selectedText = getSelectedText(view.state);

    return selectedText?.trim() ? selectedText : undefined;
  }

  const cell = view.contentDOM.querySelector(`.${ACTIVE_TABLE_CELL_CLASS}`);
  const selection = window.getSelection();

  if (!cell || !selection || selection.isCollapsed || !cell.contains(selection.anchorNode)) {
    return undefined;
  }

  const text = selection.toString();

  return text.trim() && !text.includes(LINE_BREAK) ? text : undefined;
}

export function editorFind(): Extension {
  return [findStateField, ViewPlugin.fromClass(FindHighlightPlugin, { decorations: (plugin) => plugin.decorations })];
}
