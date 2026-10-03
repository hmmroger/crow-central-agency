import type { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { findChildren, hideSyntax, isSelectionTouching, skipFollowingSpace } from "./cm-extension-utils.js";
import { findDelimiters } from "./markdown-syntax.js";
import { DELIMITED_SYNTAX_NODE, SYNTAX_NODE, type DelimitedSyntaxNodeName } from "./markdown-syntax.types.js";
import type { WikilinkMarkSpec, WikilinkSyntax } from "./wikilink-syntax.types.js";

export const LINK_CLASS = "cm-md-link";
export const LINK_URL_ATTRIBUTE = "data-url";

export const LINK_OPEN_HINT = "Ctrl/Cmd + click to open";
const TAG_CLASS = "cm-md-tag";

export const DELIMITED_CLASSES: Record<DelimitedSyntaxNodeName, string> = {
  [DELIMITED_SYNTAX_NODE.EMPHASIS]: "cm-md-em",
  [DELIMITED_SYNTAX_NODE.STRONG_EMPHASIS]: "cm-md-strong",
  [DELIMITED_SYNTAX_NODE.STRIKETHROUGH]: "cm-md-strikethrough",
  [DELIMITED_SYNTAX_NODE.SUPERSCRIPT]: "cm-md-superscript",
  [DELIMITED_SYNTAX_NODE.SUBSCRIPT]: "cm-md-subscript",
  [DELIMITED_SYNTAX_NODE.INLINE_CODE]: "cm-md-inline-code",
};

function markLink(decorations: Range<Decoration>[], from: number, to: number, url: string): void {
  decorations.push(
    Decoration.mark({
      // A linked image's widget spans the whole link text, so only an inclusive mark wraps it.
      inclusive: true,
      class: LINK_CLASS,
      attributes: { [LINK_URL_ATTRIBUTE]: url, title: LINK_OPEN_HINT },
    }).range(from, to)
  );
}

export function decorateHeading(
  syntaxNode: SyntaxNode,
  level: number,
  state: EditorState,
  decorations: Range<Decoration>[]
): void {
  const marks = findChildren(syntaxNode, SYNTAX_NODE.HEADER_MARK);

  if (marks.length === 0) {
    return;
  }

  if (!isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    const [openingMark] = marks;
    hideSyntax(state, decorations, openingMark.from, skipFollowingSpace(state, openingMark.to));

    if (marks.length > 1) {
      const closingMark = marks[marks.length - 1];
      hideSyntax(state, decorations, closingMark.from, closingMark.to);
    }
  }

  decorations.push(Decoration.line({ class: `cm-md-h${level}` }).range(state.doc.lineAt(syntaxNode.from).from));
}

export function decorateDelimited(
  syntaxNode: SyntaxNode,
  name: DelimitedSyntaxNodeName,
  state: EditorState,
  decorations: Range<Decoration>[]
): void {
  const delimiters = findDelimiters(syntaxNode, name);

  if (!delimiters) {
    return;
  }

  const { open, close } = delimiters;

  if (!isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    hideSyntax(state, decorations, open.from, open.to);
    hideSyntax(state, decorations, close.from, close.to);
  }

  if (open.to < close.from) {
    decorations.push(Decoration.mark({ class: DELIMITED_CLASSES[name] }).range(open.to, close.from));
  }
}

export function decorateEscape(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  if (!isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    hideSyntax(state, decorations, syntaxNode.from, syntaxNode.from + 1);
  }
}

/** `[text](url)`: hides `[` and `](url)`, leaving the text styled as a link. */
export function decorateLink(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  const marks = findChildren(syntaxNode, SYNTAX_NODE.LINK_MARK);
  const [urlNode] = findChildren(syntaxNode, SYNTAX_NODE.URL);

  if (!urlNode || marks.length < 3) {
    return;
  }

  const [textOpenMark, textCloseMark] = marks;

  if (!isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    hideSyntax(state, decorations, textOpenMark.from, textOpenMark.to);
    hideSyntax(state, decorations, textCloseMark.from, marks[marks.length - 1].to);
  }

  if (textOpenMark.to < textCloseMark.from) {
    markLink(decorations, textOpenMark.to, textCloseMark.from, state.sliceDoc(urlNode.from, urlNode.to));
  }
}

/** `<url>`: hides the angle brackets. */
export function decorateAutolink(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  const marks = findChildren(syntaxNode, SYNTAX_NODE.LINK_MARK);
  const [urlNode] = findChildren(syntaxNode, SYNTAX_NODE.URL);

  if (!urlNode || marks.length < 2) {
    return;
  }

  if (!isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    hideSyntax(state, decorations, marks[0].from, marks[0].to);
    hideSyntax(state, decorations, marks[1].from, marks[1].to);
  }

  markLink(decorations, urlNode.from, urlNode.to, state.sliceDoc(urlNode.from, urlNode.to));
}

/** `[[target]]`: hides `[[`, `]]` and the target's escapes, leaving the target styled as a wikilink. */
export function decorateWikilink(
  wikilink: WikilinkSyntax,
  markSpec: WikilinkMarkSpec,
  state: EditorState,
  decorations: Range<Decoration>[]
): void {
  const { openMark, closeMark, targetRange } = wikilink;

  if (!isSelectionTouching(state, wikilink.from, wikilink.to)) {
    hideSyntax(state, decorations, openMark.from, openMark.to);
    hideSyntax(state, decorations, closeMark.from, closeMark.to);

    for (const position of wikilink.escapePositions) {
      hideSyntax(state, decorations, position, position + 1);
    }
  }

  decorations.push(
    Decoration.mark({ class: markSpec.className, attributes: markSpec.attributes }).range(
      targetRange.from,
      targetRange.to
    )
  );
}

export function decorateTagLine(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  if (isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    return;
  }

  for (const tag of findChildren(syntaxNode, SYNTAX_NODE.TAG)) {
    decorations.push(Decoration.mark({ class: TAG_CLASS }).range(tag.from, tag.to));
  }
}
