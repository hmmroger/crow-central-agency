import { StateEffect, StateField, type EditorState, type Transaction } from "@codemirror/state";
import { matchFindText } from "../../../../common/find/find-matcher.js";
import type { FindQuery, FindRange } from "../../../../common/find/find.types.js";
import type { EditorFindState } from "./find-state.types.js";

/** A new query, or `undefined` to clear; the current match starts at the cursor */
export const setFindQuery = StateEffect.define<FindQuery | undefined>();

export const setFindCurrent = StateEffect.define<number>();

const NO_FIND: EditorFindState = { query: undefined, matches: [], currentIndex: undefined };

function findIndexFrom(matches: FindRange[], position: number): number | undefined {
  if (matches.length === 0) {
    return undefined;
  }

  const index = matches.findIndex((match) => match.start >= position);

  return index === -1 ? 0 : index;
}

function getCurrentMatch(findState: EditorFindState): FindRange | undefined {
  return findState.currentIndex === undefined ? undefined : findState.matches[findState.currentIndex];
}

/** The cursor, or the current match while the selection still holds it, as a table cell selection does */
function getQueryStart(findState: EditorFindState, state: EditorState): number {
  const { from, to } = state.selection.main;
  const current = getCurrentMatch(findState);

  return current && from <= current.start && current.start <= to ? current.start : from;
}

function updateFindState(previous: EditorFindState, transaction: Transaction): EditorFindState {
  let next = previous;

  if (previous.query && transaction.docChanged) {
    const matches = matchFindText(transaction.newDoc.toString(), previous.query);
    const current = getCurrentMatch(previous);
    const position = current ? transaction.changes.mapPos(current.start, 1) : transaction.newSelection.main.from;
    next = { query: previous.query, matches, currentIndex: findIndexFrom(matches, position) };
  }

  for (const effect of transaction.effects) {
    if (effect.is(setFindQuery)) {
      const query = effect.value;
      const matches = query ? matchFindText(transaction.newDoc.toString(), query) : [];
      next = query
        ? { query, matches, currentIndex: findIndexFrom(matches, getQueryStart(previous, transaction.startState)) }
        : NO_FIND;
    } else if (effect.is(setFindCurrent) && next.matches[effect.value]) {
      next = { query: next.query, matches: next.matches, currentIndex: effect.value };
    }
  }

  return next;
}

/** The editor's find query, its matches over the markdown source, and the current one */
export const findStateField = StateField.define<EditorFindState>({
  create: () => NO_FIND,
  update: updateFindState,
});

export function getFindState(state: EditorState): EditorFindState {
  return state.field(findStateField, false) ?? NO_FIND;
}
