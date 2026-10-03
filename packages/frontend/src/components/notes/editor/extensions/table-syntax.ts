import { syntaxTree } from "@codemirror/language";
import type { ChangeSpec, EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { findChildren } from "./cm-extension-utils.js";
import { readImageSyntax } from "./image-syntax.js";
import { findDelimiters, isDelimitedSyntaxNodeName } from "./markdown-syntax.js";
import { SYNTAX_NODE, type DelimitedSyntaxNodeName } from "./markdown-syntax.types.js";
import { readWikilink } from "./wikilink-syntax.js";
import {
  TABLE_ALIGNMENT,
  TABLE_SPAN_KIND,
  type ParsedTable,
  type TableAlignment,
  type TableCell,
  type TableCellSpan,
  type TableDelimiterCell,
  type TableLine,
  type TableRow,
  type TextRange,
} from "./table-syntax.types.js";

const PIPE = "|";
const ALIGNMENT_COLON = ":";
export const TRAILING_PIPE = " |";
const LINE_BREAK_TAG_PATTERN = /^<br\s*\/?>$/i;

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

function pushSpan(spans: TableCellSpan[], span: TableCellSpan, cellFrom: number): void {
  if (span.from < span.to) {
    spans.push({ ...span, from: span.from - cellFrom, to: span.to - cellFrom });
  }
}

function collectFormatSpans(
  syntaxNode: SyntaxNode,
  format: DelimitedSyntaxNodeName,
  state: EditorState,
  cellFrom: number,
  spans: TableCellSpan[]
): void {
  const delimiters = findDelimiters(syntaxNode, format);

  if (delimiters) {
    const { open, close } = delimiters;
    pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: open.from, to: open.to }, cellFrom);
    pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: close.from, to: close.to }, cellFrom);
    pushSpan(spans, { kind: TABLE_SPAN_KIND.FORMAT, format, from: open.to, to: close.from }, cellFrom);
  }

  collectCellSpans(syntaxNode, state, cellFrom, spans);
}

function collectLinkSpans(syntaxNode: SyntaxNode, state: EditorState, cellFrom: number, spans: TableCellSpan[]): void {
  const marks = findChildren(syntaxNode, SYNTAX_NODE.LINK_MARK);
  const [urlNode] = findChildren(syntaxNode, SYNTAX_NODE.URL);

  if (urlNode && marks.length >= 3) {
    const [textOpenMark, textCloseMark] = marks;
    const url = state.sliceDoc(urlNode.from, urlNode.to);
    pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: textOpenMark.from, to: textOpenMark.to }, cellFrom);
    pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: textCloseMark.from, to: marks[marks.length - 1].to }, cellFrom);
    pushSpan(spans, { kind: TABLE_SPAN_KIND.LINK, url, from: textOpenMark.to, to: textCloseMark.from }, cellFrom);
  }

  collectCellSpans(syntaxNode, state, cellFrom, spans);
}

function collectAutolinkSpans(
  syntaxNode: SyntaxNode,
  state: EditorState,
  cellFrom: number,
  spans: TableCellSpan[]
): void {
  const marks = findChildren(syntaxNode, SYNTAX_NODE.LINK_MARK);
  const [urlNode] = findChildren(syntaxNode, SYNTAX_NODE.URL);

  if (!urlNode || marks.length < 2) {
    return;
  }

  const url = state.sliceDoc(urlNode.from, urlNode.to);
  pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: marks[0].from, to: marks[0].to }, cellFrom);
  pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: marks[1].from, to: marks[1].to }, cellFrom);
  pushSpan(spans, { kind: TABLE_SPAN_KIND.LINK, url, from: urlNode.from, to: urlNode.to }, cellFrom);
}

function collectWikilinkSpans(
  syntaxNode: SyntaxNode,
  state: EditorState,
  cellFrom: number,
  spans: TableCellSpan[]
): void {
  const wikilink = readWikilink(syntaxNode, state);

  if (!wikilink) {
    return;
  }

  const { openMark, closeMark, targetRange, target } = wikilink;
  pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, ...openMark }, cellFrom);
  pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, ...closeMark }, cellFrom);

  for (const position of wikilink.escapePositions) {
    pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: position, to: position + 1 }, cellFrom);
  }

  pushSpan(spans, { kind: TABLE_SPAN_KIND.WIKILINK, target, ...targetRange }, cellFrom);
}

function collectImageSpan(syntaxNode: SyntaxNode, state: EditorState, cellFrom: number, spans: TableCellSpan[]): void {
  const image = readImageSyntax(syntaxNode, state);

  if (image) {
    pushSpan(spans, { kind: TABLE_SPAN_KIND.IMAGE, image, from: image.from, to: image.to }, cellFrom);
  }
}

/** Cells hold inline content only, so only inline constructs become spans. */
function collectCellSpans(parent: SyntaxNode, state: EditorState, cellFrom: number, spans: TableCellSpan[]): void {
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    const { name, from, to } = child;

    if (isDelimitedSyntaxNodeName(name)) {
      collectFormatSpans(child, name, state, cellFrom, spans);
      continue;
    }

    switch (name) {
      case SYNTAX_NODE.ESCAPE:
        pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from, to: from + 1 }, cellFrom);
        break;
      case SYNTAX_NODE.HTML_TAG:
        if (LINE_BREAK_TAG_PATTERN.test(state.sliceDoc(from, to))) {
          pushSpan(spans, { kind: TABLE_SPAN_KIND.LINE_BREAK, from, to }, cellFrom);
        }

        break;
      case SYNTAX_NODE.LINK:
        collectLinkSpans(child, state, cellFrom, spans);
        break;
      case SYNTAX_NODE.AUTOLINK:
        collectAutolinkSpans(child, state, cellFrom, spans);
        break;
      case SYNTAX_NODE.WIKILINK:
        collectWikilinkSpans(child, state, cellFrom, spans);
        break;
      case SYNTAX_NODE.IMAGE:
      case SYNTAX_NODE.WIKI_EMBED:
        collectImageSpan(child, state, cellFrom, spans);
        break;
    }
  }
}

function toCell(cellNode: SyntaxNode, state: EditorState): TableCell {
  const spans: TableCellSpan[] = [];
  collectCellSpans(cellNode, state, cellNode.from, spans);

  return { from: cellNode.from, to: cellNode.to, content: state.sliceDoc(cellNode.from, cellNode.to), spans };
}

/** Typed text in an empty cell goes after the space that follows its pipe, giving `| text |`. */
function toEmptyCell(segment: TextRange, state: EditorState): TableCell {
  const hasLeadingSpace = segment.from < segment.to && state.sliceDoc(segment.from, segment.from + 1) === " ";
  const position = hasLeadingSpace ? segment.from + 1 : segment.from;

  return { from: position, to: position, content: "", spans: [] };
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

/** Tables at the top level of the document; tables inside quotes or lists keep their prefixes as text. */
export function findTopLevelTables(state: EditorState): ParsedTable[] {
  const tables: ParsedTable[] = [];

  for (const tableNode of findChildren(syntaxTree(state).topNode, SYNTAX_NODE.TABLE)) {
    const table = parseTable(state, tableNode);

    if (table) {
      tables.push(table);
    }
  }

  return tables;
}

/** The top-level table whose header line starts at `lineFrom`, parsed from the current syntax tree. */
export function findTableAt(state: EditorState, lineFrom: number): ParsedTable | undefined {
  const tableNode = syntaxTree(state).topNode.childAfter(lineFrom);

  if (tableNode?.name !== SYNTAX_NODE.TABLE || state.doc.lineAt(tableNode.from).from !== lineFrom) {
    return undefined;
  }

  return parseTable(state, tableNode);
}

/** Row 0 is the header; body rows follow. */
export function getTableRow(table: ParsedTable, rowIndex: number): TableRow | undefined {
  return rowIndex === 0 ? table.header : table.rows[rowIndex - 1];
}

export function getTableRowCount(table: ParsedTable): number {
  return table.rows.length + 1;
}

export function getTableLines(table: ParsedTable): TableLine<TextRange>[] {
  return [table.header, table.delimiter].concat(table.rows);
}

/** Closes lines that end without a pipe, so emptying their last cell cannot drop it. */
export function getTrailingPipeChanges(lines: TableLine<TextRange>[]): ChangeSpec[] {
  const changes: ChangeSpec[] = [];

  for (const line of lines) {
    if (!line.hasTrailingPipe) {
      changes.push({ from: line.to, insert: TRAILING_PIPE });
    }
  }

  return changes;
}
