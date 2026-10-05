import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { findChildren } from "../cm-extension-utils.js";
import { SYNTAX_NODE } from "../markdown-syntax.types.js";
import {
  TABLE_ALIGNMENT,
  type ParsedTable,
  type TableAlignment,
  type TableCell,
  type TableCellIndex,
  type TableDelimiterCell,
  type TableLine,
  type TableRow,
  type TextRange,
} from "./table-syntax.types.js";

const PIPE = "|";
const ALIGNMENT_COLON = ":";

/** Every stretch of the line between pipes, including the ones before the first and after the last pipe. */
function getSegments(line: TextRange, pipes: TextRange[]): TextRange[] {
  const segments: TextRange[] = [];
  let segmentFrom = line.from;

  for (const pipe of pipes) {
    segments.push({ from: segmentFrom, to: pipe.from });
    segmentFrom = pipe.to;
  }

  segments.push({ from: segmentFrom, to: line.to });

  return segments;
}

function isOuterSegment(index: number, segments: TextRange[]): boolean {
  return index === 0 || index === segments.length - 1;
}

function toCell(cellNode: SyntaxNode, state: EditorState): TableCell {
  return { from: cellNode.from, to: cellNode.to, content: state.sliceDoc(cellNode.from, cellNode.to) };
}

/** Typed text in an empty cell goes after the space that follows its pipe, giving `| text |`. */
function toEmptyCell(segment: TextRange, state: EditorState): TableCell {
  const hasLeadingSpace = segment.from < segment.to && state.sliceDoc(segment.from, segment.from + 1) === " ";
  const position = hasLeadingSpace ? segment.from + 1 : segment.from;

  return { from: position, to: position, content: "" };
}

/** A pipe-less stretch before the first or after the last pipe is a cell only when it has content. */
function parseRow(rowNode: SyntaxNode, state: EditorState): TableRow {
  const pipes = findChildren(rowNode, SYNTAX_NODE.TABLE_DELIMITER);
  const cellNodes = findChildren(rowNode, SYNTAX_NODE.TABLE_CELL);
  const segments = getSegments(rowNode, pipes);
  const cells: TableCell[] = [];

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const cellNode = cellNodes.find((node) => node.from >= segment.from && node.to <= segment.to);

    if (cellNode) {
      cells.push(toCell(cellNode, state));
    } else if (!isOuterSegment(index, segments)) {
      cells.push(toEmptyCell(segment, state));
    }
  }

  const lastSegment = segments[segments.length - 1];
  const hasTrailingPipe = pipes.length > 0 && !cellNodes.some((node) => node.from >= lastSegment.from);

  return { from: rowNode.from, to: rowNode.to, cells, hasTrailingPipe };
}

function getAlignment(delimiterText: string): TableAlignment | undefined {
  const isLeft = delimiterText.startsWith(ALIGNMENT_COLON);
  const isRight = delimiterText.endsWith(ALIGNMENT_COLON);

  if (isLeft && isRight) {
    return TABLE_ALIGNMENT.CENTER;
  }

  if (isLeft) {
    return TABLE_ALIGNMENT.LEFT;
  }

  return isRight ? TABLE_ALIGNMENT.RIGHT : undefined;
}

/** The delimiter row is a single syntax node; it holds only `-`, `:`, spaces and pipes, so splitting its text is safe. */
function parseDelimiterRow(delimiterNode: SyntaxNode, state: EditorState): TableLine<TableDelimiterCell> {
  const text = state.sliceDoc(delimiterNode.from, delimiterNode.to);
  const pipes: TextRange[] = [];

  for (let index = text.indexOf(PIPE); index >= 0; index = text.indexOf(PIPE, index + 1)) {
    pipes.push({ from: delimiterNode.from + index, to: delimiterNode.from + index + 1 });
  }

  const segments = getSegments(delimiterNode, pipes);
  const cells: TableDelimiterCell[] = [];

  for (let index = 0; index < segments.length; index++) {
    const segmentText = state.sliceDoc(segments[index].from, segments[index].to);
    const trimmedText = segmentText.trim();

    if (trimmedText || !isOuterSegment(index, segments)) {
      const from = segments[index].from + segmentText.length - segmentText.trimStart().length;
      cells.push({ from, to: from + trimmedText.length, alignment: getAlignment(trimmedText) });
    }
  }

  return { from: delimiterNode.from, to: delimiterNode.to, cells, hasTrailingPipe: text.trimEnd().endsWith(PIPE) };
}

export function parseTable(state: EditorState, tableNode: SyntaxNode): ParsedTable | undefined {
  const [headerNode] = findChildren(tableNode, SYNTAX_NODE.TABLE_HEADER);
  const [delimiterNode] = findChildren(tableNode, SYNTAX_NODE.TABLE_DELIMITER);

  if (!headerNode || !delimiterNode) {
    return undefined;
  }

  return {
    from: state.doc.lineAt(tableNode.from).from,
    to: tableNode.to,
    header: parseRow(headerNode, state),
    delimiter: parseDelimiterRow(delimiterNode, state),
    rows: findChildren(tableNode, SYNTAX_NODE.TABLE_ROW).map((rowNode) => parseRow(rowNode, state)),
  };
}

/** Row 0 is the header; body rows follow. */
export function getTableRow(table: ParsedTable, rowIndex: number): TableRow | undefined {
  return rowIndex === 0 ? table.header : table.rows[rowIndex - 1];
}

export function getTableRowCount(table: ParsedTable): number {
  return table.rows.length + 1;
}

/** Cells past the header's column count are not drawn, so they have no position. */
export function getTableCell(table: ParsedTable, row: number, column: number): TableCell | undefined {
  return column < table.header.cells.length ? getTableRow(table, row)?.cells[column] : undefined;
}

/**
 * The cell holding `position`; from a pipe, a delimiter row or a spot outside every cell, the next cell in the
 * direction of travel, else the nearest cell the other way.
 */
export function findTableCellAt(table: ParsedTable, position: number, isForward: boolean): TableCellIndex | undefined {
  let before: TableCellIndex | undefined;
  let after: TableCellIndex | undefined;

  for (let row = 0; row < getTableRowCount(table); row++) {
    for (let column = 0; column < table.header.cells.length; column++) {
      const cell = getTableCell(table, row, column);

      if (!cell) {
        continue;
      }

      if (cell.from <= position && position <= cell.to) {
        return { row, column };
      }

      if (cell.to < position) {
        before = { row, column };
      } else if (!after) {
        after = { row, column };
      }
    }
  }

  return isForward ? (after ?? before) : (before ?? after);
}
