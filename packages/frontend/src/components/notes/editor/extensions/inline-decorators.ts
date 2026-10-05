import type { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { findWikilinkEscapeOffsets } from "@crow-central-agency/shared";
import type { WikilinkResolutionMap } from "../../../../hooks/queries/use-wikilink-resolve-query.types.js";
import { findChildren, hideSyntax, isSelectionTouching, skipFollowingSpace } from "./cm-extension-utils.js";
import { ImageWidget } from "./image-widget.js";
import type { WikilinkMarkSpec } from "./inline-decorators.types.js";
import { findDelimiters, getWikilinkTarget } from "./markdown-syntax.js";
import { DELIMITED_SYNTAX_NODE, SYNTAX_NODE, type DelimitedSyntaxNodeName } from "./markdown-syntax.types.js";
import { getWikilinkResolutions } from "./wikilink-resolution-state.js";

export const LINK_CLASS = "cm-md-link";
export const LINK_URL_ATTRIBUTE = "data-url";
export const WIKILINK_CLASS = "cm-md-wikilink";
export const WIKILINK_TARGET_ATTRIBUTE = "data-wikilink-target";

export const LINK_OPEN_HINT = "Ctrl/Cmd + click to open";
const UNRESOLVED_WIKILINK_CLASS = "cm-md-wikilink-unresolved";
const WIKILINK_CREATE_HINT = "Ctrl/Cmd + click to create";
const TAG_CLASS = "cm-md-tag";
const LOADABLE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

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

/**
 * A target answered as naming nothing is styled as unresolved, and a Ctrl/Cmd + click creates it; one not
 * answered yet is drawn as a plain link.
 */
export function getWikilinkMarkSpec(target: string, resolutions: WikilinkResolutionMap): WikilinkMarkSpec {
  const isResolved = !resolutions.has(target) || resolutions.get(target) !== undefined;

  return {
    className: isResolved ? WIKILINK_CLASS : `${WIKILINK_CLASS} ${UNRESOLVED_WIKILINK_CLASS}`,
    attributes: { [WIKILINK_TARGET_ATTRIBUTE]: target, title: isResolved ? LINK_OPEN_HINT : WIKILINK_CREATE_HINT },
  };
}

/** `[[target]]`: hides `[[`, `]]` and the target's escapes, leaving the target styled as a wikilink. */
export function decorateWikilink(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  const marks = findChildren(syntaxNode, SYNTAX_NODE.WIKILINK_MARK);
  const targetNode = syntaxNode.getChild(SYNTAX_NODE.WIKILINK_TARGET);

  if (marks.length < 2 || !targetNode) {
    return;
  }

  if (!isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    hideSyntax(state, decorations, marks[0].from, marks[0].to);
    hideSyntax(state, decorations, marks[1].from, marks[1].to);

    for (const offset of findWikilinkEscapeOffsets(state.sliceDoc(targetNode.from, targetNode.to))) {
      hideSyntax(state, decorations, targetNode.from + offset, targetNode.from + offset + 1);
    }
  }

  const markSpec = getWikilinkMarkSpec(getWikilinkTarget(state, targetNode), getWikilinkResolutions(state));

  decorations.push(
    Decoration.mark({ class: markSpec.className, attributes: markSpec.attributes }).range(
      targetNode.from,
      targetNode.to
    )
  );
}

/** An embed whose target is not answered yet stays text. */
function createEmbedWidget(syntaxNode: SyntaxNode, state: EditorState, source: string): ImageWidget | undefined {
  const targetNode = syntaxNode.getChild(SYNTAX_NODE.WIKILINK_TARGET);
  const target = targetNode ? getWikilinkTarget(state, targetNode) : undefined;
  const resolutions = getWikilinkResolutions(state);

  return target !== undefined && resolutions.has(target)
    ? new ImageWidget(source, resolutions.get(target), target)
    : undefined;
}

/** Only an absolute http/https url is loaded; any other image stays text. */
function createUrlImageWidget(syntaxNode: SyntaxNode, state: EditorState, source: string): ImageWidget | undefined {
  const marks = findChildren(syntaxNode, SYNTAX_NODE.LINK_MARK);
  const urlNode = syntaxNode.getChild(SYNTAX_NODE.URL);
  const url = urlNode ? URL.parse(state.sliceDoc(urlNode.from, urlNode.to)) : null;

  if (marks.length < 2 || !url || !LOADABLE_IMAGE_PROTOCOLS.has(url.protocol)) {
    return undefined;
  }

  return new ImageWidget(source, url.href, state.sliceDoc(marks[0].to, marks[1].from));
}

/** The image an `Image` or `WikiEmbed` node draws, shared by the editor line and table cells; images never span lines. */
export function createImageWidget(syntaxNode: SyntaxNode, state: EditorState): ImageWidget | undefined {
  if (state.doc.lineAt(syntaxNode.from).number !== state.doc.lineAt(syntaxNode.to).number) {
    return undefined;
  }

  const source = state.sliceDoc(syntaxNode.from, syntaxNode.to);

  return syntaxNode.name === SYNTAX_NODE.WIKI_EMBED
    ? createEmbedWidget(syntaxNode, state, source)
    : createUrlImageWidget(syntaxNode, state, source);
}

/** `![[target]]` and http/https `![alt](url)` stay images wherever the cursor is. */
export function decorateImage(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  const widget = createImageWidget(syntaxNode, state);

  if (widget) {
    decorations.push(Decoration.replace({ widget }).range(syntaxNode.from, syntaxNode.to));
  }
}

export function decorateTagLine(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  if (isSelectionTouching(state, syntaxNode.from, syntaxNode.to)) {
    return;
  }

  for (const tag of findChildren(syntaxNode, SYNTAX_NODE.TAG)) {
    decorations.push(Decoration.mark({ class: TAG_CLASS }).range(tag.from, tag.to));
  }
}
