import { isolateHistory } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type ChangeSpec, type EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { findChildren } from "./extensions/cm-extension-utils.js";
import {
  findDelimiters,
  getAtxHeadingLevel,
  getFencedCodeParts,
  isTaskMarkerChecked,
} from "./extensions/markdown-syntax.js";
import { DELIMITED_SYNTAX_NODE, SYNTAX_NODE } from "./extensions/markdown-syntax.types.js";
import {
  INLINE_FORMAT,
  LIST_KIND,
  type CommandTarget,
  type InlineFormat,
  type InlineFormatSyntax,
  type LinePrefixRule,
  type ListKind,
} from "./markdown-commands.types.js";
import type { EditorLink } from "./markdown-editor.types.js";

const INLINE_FORMAT_SYNTAX: Record<InlineFormat, InlineFormatSyntax> = {
  [INLINE_FORMAT.BOLD]: { syntaxNodeName: DELIMITED_SYNTAX_NODE.STRONG_EMPHASIS, marker: "**" },
  [INLINE_FORMAT.ITALIC]: { syntaxNodeName: DELIMITED_SYNTAX_NODE.EMPHASIS, marker: "*" },
  [INLINE_FORMAT.STRIKETHROUGH]: { syntaxNodeName: DELIMITED_SYNTAX_NODE.STRIKETHROUGH, marker: "~~" },
  [INLINE_FORMAT.INLINE_CODE]: { syntaxNodeName: DELIMITED_SYNTAX_NODE.INLINE_CODE, marker: "`" },
};

const HEADING_PREFIX_PATTERN = /^( {0,3})(#{1,6}(?:[ \t]+|$))/;
const LIST_PREFIX_PATTERN = /^([ \t]*)((?:[-*+]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\](?=[ \t]|$))?(?:[ \t]+|$))/;
const QUOTE_PREFIX_PATTERN = /^( {0,3})(> ?)/;
const LEADING_SPACE_PATTERN = /^[ \t]*/;
const BULLET_PREFIX = "- ";
const TASK_PREFIX = "- [ ] ";
const QUOTE_PREFIX = "> ";
const CODE_FENCE = "```";
const DIVIDER = "---";
const LINK_DESTINATION_WRAP_PATTERN = /[\s()]/;
const LINK_DESTINATION_UNSAFE_PATTERN = /[<>\r\n]/g;
const UNESCAPED_BRACKET_PATTERN = /(?<!\\)[[\]]/g;
const WRAPPED_LINK_DESTINATION_PATTERN = /^<(.*)>$/s;
const LINK_DESTINATION_OPEN = "(";

function getSyntaxAncestors(state: EditorState, position: number): SyntaxNode[] {
  const ancestors: SyntaxNode[] = [];

  for (
    let current: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1);
    current;
    current = current.parent
  ) {
    ancestors.push(current);
  }

  return ancestors;
}

/** The innermost construct of `format` whose content holds the whole main selection. */
function findInlineFormat(state: EditorState, format: InlineFormat): SyntaxNode | undefined {
  const { syntaxNodeName } = INLINE_FORMAT_SYNTAX[format];
  const { from, to } = state.selection.main;

  return getSyntaxAncestors(state, from).find((syntaxNode) => {
    const delimiters = syntaxNode.name === syntaxNodeName ? findDelimiters(syntaxNode, syntaxNodeName) : undefined;

    return delimiters !== undefined && from >= delimiters.open.to && to <= delimiters.close.from;
  });
}

function findLink(state: EditorState): SyntaxNode | undefined {
  const { from, to } = state.selection.main;

  return getSyntaxAncestors(state, from).find(
    (syntaxNode) =>
      (syntaxNode.name === SYNTAX_NODE.LINK || syntaxNode.name === SYNTAX_NODE.AUTOLINK) &&
      from > syntaxNode.from &&
      to < syntaxNode.to
  );
}

/** Removes the syntax around a link's visible text: `[`/`](url)` or `<`/`>`. */
function getUnlinkChanges(link: SyntaxNode): ChangeSpec[] | undefined {
  if (link.name === SYNTAX_NODE.AUTOLINK) {
    const [urlNode] = findChildren(link, SYNTAX_NODE.URL);

    return urlNode
      ? [
          { from: link.from, to: urlNode.from },
          { from: urlNode.to, to: link.to },
        ]
      : undefined;
  }

  const [textOpenMark, textCloseMark] = findChildren(link, SYNTAX_NODE.LINK_MARK);

  return textOpenMark && textCloseMark
    ? [
        { from: link.from, to: textOpenMark.to },
        { from: textCloseMark.from, to: link.to },
      ]
    : undefined;
}

function hasBalancedBrackets(text: string): boolean {
  let depth = 0;

  for (const match of text.matchAll(UNESCAPED_BRACKET_PATTERN)) {
    depth += match[0] === "[" ? 1 : -1;

    if (depth < 0) {
      return false;
    }
  }

  return depth === 0;
}

/** Balanced brackets are valid link text and stay as written; unbalanced ones would end the text early. */
function toLinkText(text: string): string {
  return hasBalancedBrackets(text) ? text : text.replace(UNESCAPED_BRACKET_PATTERN, "\\$&");
}

/**
 * Rewrites the prefix of every line the main selection touches, keeping its indentation.
 * Blank lines are left alone unless the rule includes them or the selection sits on just one line.
 */
function getLinePrefixChanges(state: EditorState, rule: LinePrefixRule): ChangeSpec[] {
  const { from, to } = state.selection.main;
  const firstLineNumber = state.doc.lineAt(from).number;
  const lastLineNumber = state.doc.lineAt(to).number;
  const changes: ChangeSpec[] = [];
  let lineIndex = 0;

  for (let lineNumber = firstLineNumber; lineNumber <= lastLineNumber; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const isSkippedBlankLine =
      line.text.trim() === "" && firstLineNumber !== lastLineNumber && !rule.includesBlankLines;

    if (isSkippedBlankLine) {
      continue;
    }

    const match = line.text.match(rule.pattern);
    const indent = match ? match[1] : (line.text.match(LEADING_SPACE_PATTERN)?.[0] ?? "");
    const existingPrefix = match ? match[2] : "";
    const prefix = rule.getPrefix(lineIndex++);

    if (existingPrefix !== prefix) {
      const prefixFrom = line.from + indent.length;
      changes.push({ from: prefixFrom, to: prefixFrom + existingPrefix.length, insert: prefix });
    }
  }

  return changes;
}

function replaceLinePrefixes(target: CommandTarget, rule: LinePrefixRule): boolean {
  const { state } = target;
  const changes = state.changes(getLinePrefixChanges(state, rule));

  if (!changes.empty) {
    target.dispatch(state.update({ changes, selection: state.selection.map(changes, 1) }));
  }

  return true;
}

function replaceHeadingPrefixes(target: CommandTarget, prefix: string): boolean {
  return replaceLinePrefixes(target, { pattern: HEADING_PREFIX_PATTERN, getPrefix: () => prefix });
}

/** Ancestors of the first character of the cursor's line, so a cursor at the line's end still counts as inside. */
function getLineSyntaxAncestors(state: EditorState): SyntaxNode[] {
  const line = state.doc.lineAt(state.selection.main.head);

  return getSyntaxAncestors(state, line.from + line.text.length - line.text.trimStart().length);
}

function findLineAncestor(state: EditorState, name: string): SyntaxNode | undefined {
  return getLineSyntaxAncestors(state).find((syntaxNode) => syntaxNode.name === name);
}

function getListPrefix(kind: ListKind, lineIndex: number): string {
  switch (kind) {
    case LIST_KIND.ORDERED:
      return `${lineIndex + 1}. `;
    case LIST_KIND.TASK:
      return TASK_PREFIX;
    case LIST_KIND.BULLET:
      return BULLET_PREFIX;
  }
}

/** Opening and closing fence lines to delete; the code between them stays. */
function getUnfenceChanges(state: EditorState, fencedCode: SyntaxNode): ChangeSpec[] {
  const parts = getFencedCodeParts(fencedCode);

  if (!parts) {
    return [];
  }

  const openLine = state.doc.lineAt(parts.openMark.from);
  const changes: ChangeSpec[] = [{ from: openLine.from, to: Math.min(openLine.to + 1, state.doc.length) }];

  if (parts.closeMark) {
    const closeLine = state.doc.lineAt(parts.closeMark.from);
    changes.push({ from: Math.max(closeLine.from - 1, openLine.to + 1), to: closeLine.to });
  }

  return changes;
}

function formatLinkDestination(url: string): string {
  const destination = url.replace(LINK_DESTINATION_UNSAFE_PATTERN, (character) => encodeURIComponent(character));

  return LINK_DESTINATION_WRAP_PATTERN.test(destination) ? `<${destination}>` : destination;
}

function unwrapLinkDestination(destination: string): string {
  return destination.match(WRAPPED_LINK_DESTINATION_PATTERN)?.[1] ?? destination;
}

/**
 * Rewrites an existing link with new text and destination: a `[text](url)` link keeps its title, a link
 * without a destination gains one, and an autolink becomes an inline link.
 */
function getLinkEditChanges(
  state: EditorState,
  link: SyntaxNode,
  text: string,
  destination: string
): ChangeSpec[] | undefined {
  if (link.name === SYNTAX_NODE.AUTOLINK) {
    return [{ from: link.from, to: link.to, insert: `[${text}](${destination})` }];
  }

  const [textOpenMark, textCloseMark, destinationOpenMark] = findChildren(link, SYNTAX_NODE.LINK_MARK);
  const [urlNode] = findChildren(link, SYNTAX_NODE.URL);

  if (!textOpenMark || !textCloseMark) {
    return undefined;
  }

  const textChange: ChangeSpec = { from: textOpenMark.to, to: textCloseMark.from, insert: text };

  if (urlNode) {
    return [textChange, { from: urlNode.from, to: urlNode.to, insert: destination }];
  }

  const destinationChange: ChangeSpec =
    destinationOpenMark && state.sliceDoc(destinationOpenMark.from, destinationOpenMark.to) === LINK_DESTINATION_OPEN
      ? { from: destinationOpenMark.to, insert: destination }
      : { from: textCloseMark.to, to: link.to, insert: `(${destination})` };

  return [textChange, destinationChange];
}

export function isInlineFormatActive(state: EditorState, format: InlineFormat): boolean {
  return findInlineFormat(state, format) !== undefined;
}

/** Unwraps the enclosing construct, or wraps the selection (or an empty pair at the cursor) in the format's marker. */
export function toggleInlineFormat(target: CommandTarget, format: InlineFormat): boolean {
  const { state } = target;
  const activeFormat = findInlineFormat(state, format);
  const delimiters = activeFormat && findDelimiters(activeFormat, INLINE_FORMAT_SYNTAX[format].syntaxNodeName);

  if (delimiters) {
    target.dispatch(
      state.update({
        changes: [
          { from: delimiters.open.from, to: delimiters.open.to },
          { from: delimiters.close.from, to: delimiters.close.to },
        ],
      })
    );

    return true;
  }

  const { marker } = INLINE_FORMAT_SYNTAX[format];
  const { from, to } = state.selection.main;

  target.dispatch(
    state.update({
      changes: [
        { from, insert: marker },
        { from: to, insert: marker },
      ],
      selection: EditorSelection.single(from + marker.length, to + marker.length),
    })
  );

  return true;
}

/** Level of the ATX heading on the cursor's line, or `undefined` when the line is not a heading. */
export function getHeadingLevel(state: EditorState): number | undefined {
  return getLineSyntaxAncestors(state)
    .map((syntaxNode) => getAtxHeadingLevel(syntaxNode.name))
    .find((level) => level !== undefined);
}

/** Sets the selected lines to heading `level`, or back to paragraphs if the cursor's line already is one. */
export function toggleHeading(target: CommandTarget, level: number): boolean {
  const prefix = getHeadingLevel(target.state) === level ? "" : `${"#".repeat(level)} `;

  return replaceHeadingPrefixes(target, prefix);
}

export function setParagraph(target: CommandTarget): boolean {
  return replaceHeadingPrefixes(target, "");
}

/** Kind of the innermost list item on the cursor's line, or `undefined` outside a list. */
export function getListKind(state: EditorState): ListKind | undefined {
  const listItem = findLineAncestor(state, SYNTAX_NODE.LIST_ITEM);

  if (!listItem) {
    return undefined;
  }

  if (findChildren(listItem, SYNTAX_NODE.TASK).length > 0) {
    return LIST_KIND.TASK;
  }

  return listItem.parent?.name === SYNTAX_NODE.ORDERED_LIST ? LIST_KIND.ORDERED : LIST_KIND.BULLET;
}

/** Makes the selected lines items of `kind`, or plain lines if the cursor's item already is one. */
export function toggleList(target: CommandTarget, kind: ListKind): boolean {
  const isRemoving = getListKind(target.state) === kind;

  return replaceLinePrefixes(target, {
    pattern: LIST_PREFIX_PATTERN,
    getPrefix: (lineIndex) => (isRemoving ? "" : getListPrefix(kind, lineIndex)),
  });
}

export function isBlockquoteActive(state: EditorState): boolean {
  return findLineAncestor(state, SYNTAX_NODE.BLOCKQUOTE) !== undefined;
}

/** Quotes the selected lines, blank ones included so they stay one quote, or removes one quote level. */
export function toggleBlockquote(target: CommandTarget): boolean {
  const prefix = isBlockquoteActive(target.state) ? "" : QUOTE_PREFIX;

  return replaceLinePrefixes(target, {
    pattern: QUOTE_PREFIX_PATTERN,
    getPrefix: () => prefix,
    includesBlankLines: true,
  });
}

export function isCodeBlockActive(state: EditorState): boolean {
  return findLineAncestor(state, SYNTAX_NODE.FENCED_CODE) !== undefined;
}

/** Fences the selected lines, or removes the fences around the cursor's code block. */
export function toggleCodeBlock(target: CommandTarget): boolean {
  const { state } = target;
  const fencedCode = findLineAncestor(state, SYNTAX_NODE.FENCED_CODE);

  if (fencedCode) {
    target.dispatch(state.update({ changes: getUnfenceChanges(state, fencedCode) }));

    return true;
  }

  const { anchor, head, from, to } = state.selection.main;
  const openFence = `${CODE_FENCE}\n`;

  target.dispatch(
    state.update({
      changes: [
        { from: state.doc.lineAt(from).from, insert: openFence },
        { from: state.doc.lineAt(to).to, insert: `\n${CODE_FENCE}` },
      ],
      selection: EditorSelection.single(anchor + openFence.length, head + openFence.length),
    })
  );

  return true;
}

/**
 * Puts a divider on its own line below the cursor's line, with a blank line before it where needed
 * so a paragraph above does not turn it into a heading, and leaves the cursor on the line after it.
 */
export function insertDivider(target: CommandTarget): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const isBlankLine = line.text.trim() === "";
  const previousLine = line.number > 1 ? state.doc.line(line.number - 1) : undefined;
  const nextLine = line.number < state.doc.lines ? state.doc.line(line.number + 1) : undefined;
  const needsBlankLineBefore = isBlankLine ? previousLine !== undefined && previousLine.text.trim() !== "" : true;
  const needsLineAfter = nextLine === undefined || nextLine.text.trim() !== "";
  const insert = `${needsBlankLineBefore ? "\n" : ""}${isBlankLine ? "" : "\n"}${DIVIDER}${needsLineAfter ? "\n" : ""}`;
  const from = isBlankLine ? line.from : line.to;
  // Without a new line after the divider, the cursor moves onto the blank line that already follows it.
  const cursor = from + insert.length + (needsLineAfter ? 0 : 1);

  target.dispatch(
    state.update({
      changes: { from, to: isBlankLine ? line.to : from, insert },
      selection: EditorSelection.cursor(cursor),
    })
  );

  return true;
}

/** Text and destination of the link around the cursor; an autolink's text is its URL. */
export function getLink(state: EditorState): EditorLink | undefined {
  const link = findLink(state);

  if (!link) {
    return undefined;
  }

  const [urlNode] = findChildren(link, SYNTAX_NODE.URL);
  const url = urlNode ? unwrapLinkDestination(state.sliceDoc(urlNode.from, urlNode.to)) : "";

  if (link.name === SYNTAX_NODE.AUTOLINK) {
    return { text: url, url };
  }

  const [textOpenMark, textCloseMark] = findChildren(link, SYNTAX_NODE.LINK_MARK);

  return textOpenMark && textCloseMark ? { text: state.sliceDoc(textOpenMark.to, textCloseMark.from), url } : undefined;
}

/** The main selection's text, when it is non-empty and on one line. */
export function getSelectedText(state: EditorState): string | undefined {
  const { from, to } = state.selection.main;

  return from !== to && state.doc.lineAt(from).number === state.doc.lineAt(to).number
    ? state.sliceDoc(from, to)
    : undefined;
}

/**
 * Points the link around the cursor at `url` with label `text`, or replaces the selection with a new link.
 * A blank `text` falls back to the selection, or the URL when nothing is selected; a blank `url` does nothing.
 */
export function setLink(target: CommandTarget, text: string, url: string): boolean {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return false;
  }

  const { state } = target;
  const { from, to } = state.selection.main;
  const linkText = toLinkText(text.trim() || (from === to ? trimmedUrl : state.sliceDoc(from, to)));
  const destination = formatLinkDestination(trimmedUrl);
  const link = findLink(state);
  const changeSpecs = link
    ? getLinkEditChanges(state, link, linkText, destination)
    : [{ from, to, insert: `[${linkText}](${destination})` }];

  if (!changeSpecs) {
    return false;
  }

  const changes = state.changes(changeSpecs);

  target.dispatch(state.update({ changes, selection: EditorSelection.cursor(changes.mapPos(link ? link.to : to, 1)) }));

  return true;
}

/** Flips the task marker at `position` between `[ ]` and `[x]`, as an undo step of its own. */
export function toggleTask(target: CommandTarget, position: number): boolean {
  const { state } = target;
  const taskMarker = getSyntaxAncestors(state, position).find(
    (syntaxNode) => syntaxNode.name === SYNTAX_NODE.TASK_MARKER
  );

  if (!taskMarker) {
    return false;
  }

  const isChecked = isTaskMarkerChecked(state.sliceDoc(taskMarker.from, taskMarker.to));

  target.dispatch(
    state.update({
      changes: { from: taskMarker.from + 1, to: taskMarker.to - 1, insert: isChecked ? " " : "x" },
      annotations: isolateHistory.of("full"),
    })
  );

  return true;
}

/** Keeps the link's visible text and drops its link syntax. */
export function removeLink(target: CommandTarget): boolean {
  const { state } = target;
  const link = findLink(state);
  const changes = link && getUnlinkChanges(link);

  if (!changes) {
    return false;
  }

  target.dispatch(state.update({ changes }));

  return true;
}
