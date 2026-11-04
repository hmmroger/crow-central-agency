import { MapMode, StateEffect, StateField, type EditorState, type Transaction } from "@codemirror/state";
import type { TableHeight } from "./table-height-state.types.js";

export const setTableHeight = StateEffect.define<TableHeight>();

function mapTableHeights(heights: ReadonlyMap<number, number>, transaction: Transaction): ReadonlyMap<number, number> {
  const mapped = new Map<number, number>();

  for (const [tableFrom, height] of heights) {
    const nextFrom = transaction.changes.mapPos(tableFrom, 1, MapMode.TrackDel);

    if (nextFrom !== null) {
      mapped.set(nextFrom, height);
    }
  }

  return mapped;
}

function updateTableHeights(
  previous: ReadonlyMap<number, number>,
  transaction: Transaction
): ReadonlyMap<number, number> {
  let heights = transaction.docChanged && previous.size > 0 ? mapTableHeights(previous, transaction) : previous;

  for (const effect of transaction.effects) {
    if (effect.is(setTableHeight)) {
      heights = new Map(heights).set(effect.value.tableFrom, effect.value.height);
    }
  }

  return heights;
}

/**
 * Each drawn table's last height, by the start of its header line. A redrawn table needs it as its
 * estimate: the editor would otherwise count it as one line until measured, which can drop a tall
 * table out of the viewport and clamp the scroll position.
 */
export const tableHeightsField = StateField.define<ReadonlyMap<number, number>>({
  create: () => new Map(),
  update: updateTableHeights,
});

export function getTableHeight(state: EditorState, tableFrom: number): number | undefined {
  return state.field(tableHeightsField, false)?.get(tableFrom);
}
