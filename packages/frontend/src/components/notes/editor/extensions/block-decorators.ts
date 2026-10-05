import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { HTMLVIEW_FENCE_LANG } from "@crow-central-agency/shared";
import type { VisibleRange } from "./block-decorators.types.js";
import { BulletWidget } from "./bullet-widget.js";
import { findChildren, hideSyntax, isSelectionTouching, skipFollowingSpace } from "./cm-extension-utils.js";
import { CodeCopyWidget } from "./code-copy-widget.js";
import { DividerWidget } from "./divider-widget.js";
import { HtmlviewWidget } from "./htmlview-widget.js";
import {
  getFencedCodeLanguage,
  getFencedCodeParts,
  getFencedCodeText,
  isTaskMarkerChecked,
} from "./markdown-syntax.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import { MERMAID_FENCE_LANG, MermaidWidget } from "./mermaid-widget.js";
import { getActiveTableCell } from "./table/table-cell-state.js";
import { parseTable } from "./table/table-syntax.js";
import { TableWidget } from "./table/table-widget.js";
import { TaskCheckboxWidget } from "./task-checkbox-widget.js";
import { getWikilinkResolutions } from "./wikilink-resolution-state.js";

const BULLET = Decoration.replace({ widget: new BulletWidget() });
const DIVIDER = Decoration.replace({ widget: new DividerWidget() });
const LIST_NUMBER = Decoration.mark({ class: "cm-md-list-number" });
const CHECKED_TASK = Decoration.replace({ widget: new TaskCheckboxWidget(true) });
const UNCHECKED_TASK = Decoration.replace({ widget: new TaskCheckboxWidget(false) });
const CODE_FENCE_OPEN_LINE = Decoration.line({ class: "cm-md-code-fence-open" });
const CODE_FENCE_CLOSE_LINE = Decoration.line({ class: "cm-md-code-fence-close" });
const CODE_LINE = Decoration.line({ class: "cm-md-code-line" });
const CODE_COPY = Decoration.widget({ widget: new CodeCopyWidget(), side: 1 });
const QUOTE_LINE_CLASS = "cm-md-blockquote";
const QUOTE_DEPTH_PROPERTY = "--md-quote-depth";

const quoteLineDecorations = new Map<number, Decoration>();

function getQuoteLineDecoration(depth: number): Decoration {
  const cached = quoteLineDecorations.get(depth);

  if (cached) {
    return cached;
  }

  const decoration = Decoration.line({
    class: QUOTE_LINE_CLASS,
    attributes: { style: `${QUOTE_DEPTH_PROPERTY}: ${depth}` },
  });
  quoteLineDecorations.set(depth, decoration);

  return decoration;
}

function countEnclosingQuotes(syntaxNode: SyntaxNode | null): number {
  let depth = 0;

  for (let current = syntaxNode; current; current = current.parent) {
    if (current.name === SYNTAX_NODE.BLOCKQUOTE) {
      depth++;
    }
  }

  return depth;
}

function findOutermostQuote(syntaxNode: SyntaxNode): SyntaxNode | undefined {
  let outermost: SyntaxNode | undefined;

  for (let current: SyntaxNode | null = syntaxNode; current; current = current.parent) {
    if (current.name === SYNTAX_NODE.BLOCKQUOTE) {
      outermost = current;
    }
  }

  return outermost;
}

/** Hides the list mark so only the checkbox shows in its place. */
function decorateTask(
  listMark: SyntaxNode,
  task: SyntaxNode,
  state: EditorState,
  decorations: Range<Decoration>[]
): void {
  const [taskMarker] = findChildren(task, SYNTAX_NODE.TASK_MARKER);

  if (!taskMarker) {
    return;
  }

  const isChecked = isTaskMarkerChecked(state.sliceDoc(taskMarker.from, taskMarker.to));

  hideSyntax(state, decorations, listMark.from, skipFollowingSpace(state, listMark.to));
  decorations.push((isChecked ? CHECKED_TASK : UNCHECKED_TASK).range(taskMarker.from, taskMarker.to));
}

/**
 * Draws one bar per nesting depth on every visible line of an outermost quote. A line's
 * depth is read at its end, so a lazy continuation line keeps the depth of its paragraph.
 */
export function decorateBlockquote(
  syntaxNode: SyntaxNode,
  state: EditorState,
  decorations: Range<Decoration>[],
  visibleRange: VisibleRange
): void {
  if (syntaxNode.parent && findOutermostQuote(syntaxNode.parent)) {
    return;
  }

  if (isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    return;
  }

  const tree = syntaxTree(state);
  const firstLineNumber = state.doc.lineAt(Math.max(syntaxNode.from, visibleRange.from)).number;
  const lastLineNumber = state.doc.lineAt(Math.min(syntaxNode.to, visibleRange.to)).number;

  for (let lineNumber = firstLineNumber; lineNumber <= lastLineNumber; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const depth = countEnclosingQuotes(tree.resolveInner(line.to, -1));

    decorations.push(getQuoteLineDecoration(Math.max(depth, 1)).range(line.from));
  }
}

/** Quote marks show raw while the selection touches any part of their outermost quote. */
export function decorateQuoteMark(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  const outermostQuote = findOutermostQuote(syntaxNode);

  if (outermostQuote && !isSelectionTouching(state, outermostQuote.from, outermostQuote.to)) {
    hideSyntax(state, decorations, syntaxNode.from, skipFollowingSpace(state, syntaxNode.to));
  }
}

function getCodeLineDecoration(lineNumber: number, openLineNumber: number, closeLineNumber?: number): Decoration {
  if (lineNumber === openLineNumber) {
    return CODE_FENCE_OPEN_LINE;
  }

  return lineNumber === closeLineNumber ? CODE_FENCE_CLOSE_LINE : CODE_LINE;
}

/** The fence lines stay as the block's top and bottom edges; their text shows while the selection touches the block. */
export function decorateFencedCode(
  syntaxNode: SyntaxNode,
  state: EditorState,
  decorations: Range<Decoration>[],
  visibleRange: VisibleRange
): void {
  const parts = getFencedCodeParts(syntaxNode);

  if (!parts) {
    return;
  }

  const openLine = state.doc.lineAt(parts.openMark.from);
  const closeLine = parts.closeMark ? state.doc.lineAt(parts.closeMark.from) : undefined;
  const firstLineNumber = Math.max(openLine.number, state.doc.lineAt(visibleRange.from).number);
  const lastLineNumber = state.doc.lineAt(Math.min(syntaxNode.to, visibleRange.to)).number;

  for (let lineNumber = firstLineNumber; lineNumber <= lastLineNumber; lineNumber++) {
    const line = state.doc.line(lineNumber);

    decorations.push(getCodeLineDecoration(lineNumber, openLine.number, closeLine?.number).range(line.from));
  }

  if (isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    return;
  }

  hideSyntax(state, decorations, parts.openMark.from, openLine.to);
  decorations.push(CODE_COPY.range(openLine.to));

  if (parts.closeMark && closeLine) {
    hideSyntax(state, decorations, parts.closeMark.from, closeLine.to);
  }
}

/** A terminated mermaid or htmlview fence that opens its line is drawn as its preview while the selection is outside it. */
export function decorateFencePreview(
  syntaxNode: SyntaxNode,
  state: EditorState,
  decorations: Range<Decoration>[]
): void {
  const language = getFencedCodeLanguage(state, syntaxNode);
  const openLine = state.doc.lineAt(syntaxNode.from);
  const closeLine = state.doc.lineAt(syntaxNode.to);

  if (
    (language !== MERMAID_FENCE_LANG && language !== HTMLVIEW_FENCE_LANG) ||
    openLine.text.slice(0, syntaxNode.from - openLine.from).trim() !== "" ||
    !getFencedCodeParts(syntaxNode)?.closeMark ||
    isSelectionTouching(state, openLine.from, closeLine.to)
  ) {
    return;
  }

  const source = getFencedCodeText(state, syntaxNode);
  const widget = language === MERMAID_FENCE_LANG ? new MermaidWidget(source) : new HtmlviewWidget(source);

  decorations.push(Decoration.replace({ widget, block: true }).range(openLine.from, closeLine.to));
}

/** A GFM table drawn as a grid, whatever the selection, whose cells are edited in place. */
export function decorateTable(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  const table = parseTable(state, syntaxNode);

  if (!table) {
    return;
  }

  const activeCell = getActiveTableCell(state);
  const widget = new TableWidget(
    table,
    activeCell?.tableFrom === table.from ? activeCell : undefined,
    getWikilinkResolutions(state)
  );

  decorations.push(Decoration.replace({ widget, block: true }).range(table.from, table.to));
}

export function decorateHorizontalRule(
  syntaxNode: SyntaxNode,
  state: EditorState,
  decorations: Range<Decoration>[]
): void {
  if (!isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    decorations.push(DIVIDER.range(syntaxNode.from, syntaxNode.to));
  }
}

/** A list mark, and a task's checkbox, show raw while the selection touches the line they sit on. */
export function decorateListItem(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  const [listMark] = findChildren(syntaxNode, SYNTAX_NODE.LIST_MARK);

  if (!listMark) {
    return;
  }

  const isRevealed = isSelectionTouching(state, syntaxNode.from, state.doc.lineAt(listMark.from).to);
  const [task] = findChildren(syntaxNode, SYNTAX_NODE.TASK);

  if (task) {
    if (!isRevealed) {
      decorateTask(listMark, task, state, decorations);
    }

    return;
  }

  if (syntaxNode.parent?.name === SYNTAX_NODE.ORDERED_LIST) {
    decorations.push(LIST_NUMBER.range(listMark.from, listMark.to));
  } else if (!isRevealed) {
    decorations.push(BULLET.range(listMark.from, listMark.to));
  }
}
