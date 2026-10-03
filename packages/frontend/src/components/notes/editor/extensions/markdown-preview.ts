import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import {
  decorateBlockquote,
  decorateFencedCode,
  decorateHorizontalRule,
  decorateListItem,
  decorateQuoteMark,
} from "./block-decorators.js";
import type { VisibleRange } from "./block-decorators.types.js";
import {
  decorateAutolink,
  decorateDelimited,
  decorateEscape,
  decorateHeading,
  decorateLink,
  decorateTagLine,
  decorateWikilink,
} from "./inline-decorators.js";
import { getAtxHeadingLevel, isDelimitedSyntaxNodeName } from "./markdown-syntax.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import { getNotesTree } from "./notes-tree-state.js";
import { getWikilinkMarkSpec, readWikilink } from "./wikilink-syntax.js";

function decorateWikilinkNode(syntaxNode: SyntaxNode, state: EditorState, decorations: Range<Decoration>[]): void {
  const wikilink = readWikilink(syntaxNode, state);

  if (wikilink) {
    decorateWikilink(wikilink, getWikilinkMarkSpec(wikilink.target, getNotesTree(state)), state, decorations);
  }
}

/** Returns `false` to skip the node's children, as `Tree.iterate` expects. */
function decorateSyntaxNode(
  syntaxNode: SyntaxNode,
  state: EditorState,
  decorations: Range<Decoration>[],
  visibleRange: VisibleRange
): false | undefined {
  const { name } = syntaxNode;
  const headingLevel = getAtxHeadingLevel(name);

  if (headingLevel !== undefined) {
    decorateHeading(syntaxNode, headingLevel, state, decorations);

    return undefined;
  }

  if (isDelimitedSyntaxNodeName(name)) {
    decorateDelimited(syntaxNode, name, state, decorations);

    return undefined;
  }

  switch (name) {
    case SYNTAX_NODE.LINK:
      decorateLink(syntaxNode, state, decorations);

      return undefined;
    case SYNTAX_NODE.AUTOLINK:
      decorateAutolink(syntaxNode, state, decorations);

      return false;
    case SYNTAX_NODE.ESCAPE:
      decorateEscape(syntaxNode, state, decorations);

      return false;
    case SYNTAX_NODE.TAG_LINE:
      decorateTagLine(syntaxNode, state, decorations);

      return false;
    case SYNTAX_NODE.HORIZONTAL_RULE:
      decorateHorizontalRule(syntaxNode, state, decorations);

      return false;
    case SYNTAX_NODE.LIST_ITEM:
      decorateListItem(syntaxNode, state, decorations);

      return undefined;
    case SYNTAX_NODE.FENCED_CODE:
      decorateFencedCode(syntaxNode, state, decorations, visibleRange);

      return false;
    case SYNTAX_NODE.BLOCKQUOTE:
      decorateBlockquote(syntaxNode, state, decorations, visibleRange);

      return undefined;
    case SYNTAX_NODE.QUOTE_MARK:
      decorateQuoteMark(syntaxNode, state, decorations);

      return false;
    case SYNTAX_NODE.WIKILINK:
      decorateWikilinkNode(syntaxNode, state, decorations);

      return false;
    case SYNTAX_NODE.TABLE:
    case SYNTAX_NODE.IMAGE:
    case SYNTAX_NODE.WIKI_EMBED:
      return false;
    default:
      return undefined;
  }
}

function buildPreviewDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const tree = syntaxTree(state);
  const decorations: Range<Decoration>[] = [];

  for (const visibleRange of view.visibleRanges) {
    tree.iterate({
      from: visibleRange.from,
      to: visibleRange.to,
      enter: (nodeRef) => decorateSyntaxNode(nodeRef.node, state, decorations, visibleRange),
    });
  }

  return Decoration.set(decorations, true);
}

class PreviewPlugin {
  public decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildPreviewDecorations(view);
  }

  public update(update: ViewUpdate): void {
    const isTreeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
    // Wikilinks restyle once the note they name is created, renamed or removed.
    const isNotesTreeChanged = getNotesTree(update.startState) !== getNotesTree(update.state);

    if (update.docChanged || update.selectionSet || update.viewportChanged || isTreeChanged || isNotesTreeChanged) {
      this.decorations = buildPreviewDecorations(update.view);
    }
  }
}

/** Hides markdown syntax outside the selection so the note reads as rendered text. */
export function markdownPreview(): Extension {
  return ViewPlugin.fromClass(PreviewPlugin, { decorations: (plugin) => plugin.decorations });
}
