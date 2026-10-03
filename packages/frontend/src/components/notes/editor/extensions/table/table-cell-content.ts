import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { findWikilinkEscapeOffsets } from "@crow-central-agency/shared";
import type { WikilinkResolutionMap } from "../../../../../hooks/queries/use-wikilink-resolve-query.types.js";
import { findChildren, findSyntaxAncestor } from "../cm-extension-utils.js";
import type { ImageWidget } from "../image-widget.js";
import {
  createImageWidget,
  DELIMITED_CLASSES,
  getWikilinkMarkSpec,
  LINK_CLASS,
  LINK_OPEN_HINT,
  LINK_URL_ATTRIBUTE,
} from "../inline-decorators.js";
import type { WikilinkMarkSpec } from "../inline-decorators.types.js";
import { findDelimiters, getWikilinkTarget, isDelimitedSyntaxNodeName } from "../markdown-syntax.js";
import { SYNTAX_NODE, type DelimitedSyntaxNodeName } from "../markdown-syntax.types.js";
import { TABLE_SPAN_KIND, type TableCellSpan } from "./table-cell-content.types.js";
import type { TableCell } from "./table-syntax.types.js";
import { getWikilinkResolutions } from "../wikilink-resolution-state.js";

const LINE_BREAK = "\n";
const LINE_BREAK_TAG = "<br>";
const LINE_BREAK_TAG_PATTERN = /<br\s*\/?>/gi;
const SINGLE_LINE_BREAK_TAG_PATTERN = /^<br\s*\/?>$/i;
const LINE_BREAK_PATTERN = /\n/g;
const UNESCAPED_PIPE_PATTERN = /(?<!\\)\|/g;
const ESCAPED_PIPE = "\\|";
/** Marks a cell whose last line break is followed by an extra one, since a trailing break alone does not render */
const TRAILING_BREAK_ATTRIBUTE = "data-trailing-break";

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
  const marks = findChildren(syntaxNode, SYNTAX_NODE.WIKILINK_MARK);
  const targetNode = syntaxNode.getChild(SYNTAX_NODE.WIKILINK_TARGET);

  if (marks.length < 2 || !targetNode) {
    return;
  }

  const { from, to } = targetNode;
  pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: marks[0].from, to: marks[0].to }, cellFrom);
  pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: marks[1].from, to: marks[1].to }, cellFrom);

  for (const offset of findWikilinkEscapeOffsets(state.sliceDoc(from, to))) {
    pushSpan(spans, { kind: TABLE_SPAN_KIND.MARK, from: from + offset, to: from + offset + 1 }, cellFrom);
  }

  pushSpan(spans, { kind: TABLE_SPAN_KIND.WIKILINK, target: getWikilinkTarget(state, targetNode), from, to }, cellFrom);
}

function collectImageSpan(syntaxNode: SyntaxNode, state: EditorState, cellFrom: number, spans: TableCellSpan[]): void {
  const widget = createImageWidget(syntaxNode, state);

  if (widget) {
    pushSpan(spans, { kind: TABLE_SPAN_KIND.IMAGE, widget, from: syntaxNode.from, to: syntaxNode.to }, cellFrom);
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
        if (SINGLE_LINE_BREAK_TAG_PATTERN.test(state.sliceDoc(from, to))) {
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

/** The inline syntax of a cell, read from its `TableCell` node; an empty cell has no node and no spans. */
function getCellSpans(cell: TableCell, state: EditorState): TableCellSpan[] {
  const cellNode = cell.from < cell.to ? findSyntaxAncestor(state, cell.to, SYNTAX_NODE.TABLE_CELL) : undefined;
  const spans: TableCellSpan[] = [];

  if (cellNode) {
    collectCellSpans(cellNode, state, cellNode.from, spans);
  }

  return spans;
}

function getSegmentBoundaries(spans: TableCellSpan[], length: number): number[] {
  const boundaries = new Set([0, length]);

  for (const span of spans) {
    boundaries.add(span.from);
    boundaries.add(span.to);
  }

  return Array.from(boundaries).sort((first, second) => first - second);
}

function toLinkAttributes(url: string): Record<string, string> {
  return { [LINK_URL_ATTRIBUTE]: url, title: LINK_OPEN_HINT };
}

function setAttributes(element: HTMLElement, attributes: Record<string, string>): void {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

/** A linked image sits inside its link's element, so Ctrl/Cmd + click on it opens the link. */
function createImageNode(widget: ImageWidget, coveringSpans: TableCellSpan[]): Node {
  const imageNode = widget.toDOM();
  const linkSpan = coveringSpans.find((span) => span.kind === TABLE_SPAN_KIND.LINK);

  if (!linkSpan) {
    return imageNode;
  }

  const link = document.createElement("span");
  link.className = LINK_CLASS;
  setAttributes(link, toLinkAttributes(linkSpan.url));
  link.append(imageNode);

  return link;
}

/** Resolves each wikilink once, since escapes split its text into several segments. */
function buildWikilinkMarkSpecs(
  spans: TableCellSpan[],
  resolutions: WikilinkResolutionMap
): Map<TableCellSpan, WikilinkMarkSpec> {
  const markSpecs = new Map<TableCellSpan, WikilinkMarkSpec>();

  for (const span of spans) {
    if (span.kind === TABLE_SPAN_KIND.WIKILINK) {
      markSpecs.set(span, getWikilinkMarkSpec(span.target, resolutions));
    }
  }

  return markSpecs;
}

function createSegmentNode(
  text: string,
  coveringSpans: TableCellSpan[],
  wikilinkMarkSpecs: Map<TableCellSpan, WikilinkMarkSpec>
): Node {
  const classes: string[] = [];
  const attributes: Record<string, string> = {};

  for (const span of coveringSpans) {
    if (span.kind === TABLE_SPAN_KIND.FORMAT) {
      classes.push(DELIMITED_CLASSES[span.format]);
    } else if (span.kind === TABLE_SPAN_KIND.LINK) {
      classes.push(LINK_CLASS);
      Object.assign(attributes, toLinkAttributes(span.url));
    } else if (span.kind === TABLE_SPAN_KIND.WIKILINK) {
      const markSpec = wikilinkMarkSpecs.get(span);

      if (markSpec) {
        classes.push(markSpec.className);
        Object.assign(attributes, markSpec.attributes);
      }
    }
  }

  if (classes.length === 0) {
    return document.createTextNode(text);
  }

  const element = document.createElement("span");
  element.className = classes.join(" ");
  element.textContent = text;

  setAttributes(element, attributes);

  return element;
}

/**
 * Shows the cell as rendered inline markdown: syntax marks hidden, formats and links styled, `<br>` as a
 * line break, images drawn.
 */
export function renderInactiveCell(element: HTMLElement, cell: TableCell, state: EditorState): void {
  const spans = getCellSpans(cell, state);
  const boundaries = getSegmentBoundaries(spans, cell.content.length);
  const wikilinkMarkSpecs = buildWikilinkMarkSpecs(spans, getWikilinkResolutions(state));

  element.replaceChildren();

  for (let index = 0; index < boundaries.length - 1; index++) {
    const from = boundaries[index];
    const to = boundaries[index + 1];
    const coveringSpans = spans.filter((span) => span.from <= from && span.to >= to);
    const imageSpan = coveringSpans.find((span) => span.kind === TABLE_SPAN_KIND.IMAGE);

    if (imageSpan) {
      if (imageSpan.from === from) {
        element.append(createImageNode(imageSpan.widget, coveringSpans));
      }
    } else if (coveringSpans.some((span) => span.kind === TABLE_SPAN_KIND.LINE_BREAK)) {
      element.append(document.createElement("br"));
    } else if (!coveringSpans.some((span) => span.kind === TABLE_SPAN_KIND.MARK)) {
      element.append(createSegmentNode(cell.content.slice(from, to), coveringSpans, wikilinkMarkSpecs));
    }
  }
}

/** Adds or drops the extra final line break so a line break the user typed at the end stays visible. */
export function ensureTrailingBreak(element: HTMLElement): void {
  if (element.hasAttribute(TRAILING_BREAK_ATTRIBUTE)) {
    element.removeAttribute(TRAILING_BREAK_ATTRIBUTE);

    if (element.lastChild?.textContent === LINE_BREAK) {
      element.lastChild.remove();
    }
  }

  if (element.textContent.endsWith(LINE_BREAK)) {
    element.append(LINE_BREAK);
    element.setAttribute(TRAILING_BREAK_ATTRIBUTE, "");
  }
}

export function hasTrailingBreak(element: HTMLElement): boolean {
  return element.hasAttribute(TRAILING_BREAK_ATTRIBUTE);
}

/** Shows the cell's markdown as editable text, with each `<br>` as a line break. */
export function renderActiveCell(element: HTMLElement, markdown: string): void {
  element.textContent = markdown.replace(LINE_BREAK_TAG_PATTERN, LINE_BREAK);
  ensureTrailingBreak(element);
}

/** Converts `text` typed into a cell back to one-line cell markdown. */
export function toCellMarkdown(text: string): string {
  return text.replace(LINE_BREAK_PATTERN, LINE_BREAK_TAG).replace(UNESCAPED_PIPE_PATTERN, ESCAPED_PIPE);
}

/** The markdown of an edited cell; the extra final line break is display-only and not part of it. */
export function readActiveCell(element: HTMLElement): string {
  const text = element.textContent;

  return toCellMarkdown(hasTrailingBreak(element) && text.endsWith(LINE_BREAK) ? text.slice(0, -1) : text);
}
