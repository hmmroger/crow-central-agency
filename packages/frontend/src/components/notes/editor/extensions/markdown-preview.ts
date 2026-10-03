import { syntaxTree } from "@codemirror/language";
import { Prec, StateField, type EditorState, type Extension, type Range, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import {
  decorateBlockquote,
  decorateFencedCode,
  decorateFencePreview,
  decorateHorizontalRule,
  decorateListItem,
  decorateQuoteMark,
  decorateTable,
} from "./block-decorators.js";
import type { VisibleRange } from "./block-decorators.types.js";
import { ImageWidget } from "./image-widget.js";
import {
  decorateAutolink,
  decorateDelimited,
  decorateEscape,
  decorateHeading,
  decorateImage,
  decorateLink,
  decorateTagLine,
  decorateWikilink,
} from "./inline-decorators.js";
import { getAtxHeadingLevel, isDelimitedSyntaxNodeName } from "./markdown-syntax.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import type { BlockDecorations } from "./markdown-preview.types.js";
import { activeTableCellField, getActiveTableCell } from "./table/table-cell-state.js";
import { getWikilinkResolutions } from "./wikilink-resolution-state.js";

/** Inline and line decorations for the visible ranges, which show raw syntax wherever the selection touches. */
class PreviewPlugin {
  public decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  public update(update: ViewUpdate): void {
    const isTreeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
    const isResolutionsChanged = getWikilinkResolutions(update.startState) !== getWikilinkResolutions(update.state);

    if (update.docChanged || update.selectionSet || update.viewportChanged || isTreeChanged || isResolutionsChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const { state } = view;
    const tree = syntaxTree(state);
    const decorations: Range<Decoration>[] = [];

    for (const visibleRange of view.visibleRanges) {
      tree.iterate({
        from: visibleRange.from,
        to: visibleRange.to,
        enter: (nodeRef) => this.decorateSyntaxNode(nodeRef.node, state, decorations, visibleRange),
      });
    }

    return Decoration.set(decorations, true);
  }

  /** Returns `false` to skip the node's children, as `Tree.iterate` expects. */
  private decorateSyntaxNode(
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
        decorateWikilink(syntaxNode, state, decorations);

        return false;
      case SYNTAX_NODE.TABLE:
      case SYNTAX_NODE.IMAGE:
      case SYNTAX_NODE.WIKI_EMBED:
        return false;
      default:
        return undefined;
    }
  }
}

/** Returns `false` to skip the node's children, as `Tree.iterate` expects. */
function decorateBlockSyntaxNode(
  syntaxNode: SyntaxNode,
  state: EditorState,
  decorations: Range<Decoration>[]
): false | undefined {
  switch (syntaxNode.name) {
    case SYNTAX_NODE.TABLE:
      if (!syntaxNode.parent?.type.isTop) {
        return undefined;
      }

      decorateTable(syntaxNode, state, decorations);

      return false;
    case SYNTAX_NODE.FENCED_CODE:
      decorateFencePreview(syntaxNode, state, decorations);

      return false;
    case SYNTAX_NODE.IMAGE:
    case SYNTAX_NODE.WIKI_EMBED:
      decorateImage(syntaxNode, state, decorations);

      return false;
    default:
      return undefined;
  }
}

function buildBlockDecorations(state: EditorState): BlockDecorations {
  const decorations: Range<Decoration>[] = [];

  syntaxTree(state).iterate({ enter: (nodeRef) => decorateBlockSyntaxNode(nodeRef.node, state, decorations) });

  return {
    decorations: Decoration.set(decorations, true),
    atomicRanges: Decoration.set(
      decorations.filter((range) => range.value.spec.widget instanceof ImageWidget),
      true
    ),
  };
}

function updateBlockDecorations(previous: BlockDecorations, transaction: Transaction): BlockDecorations {
  const { startState, state } = transaction;

  if (
    transaction.docChanged ||
    transaction.selection ||
    syntaxTree(startState) !== syntaxTree(state) ||
    getWikilinkResolutions(startState) !== getWikilinkResolutions(state) ||
    getActiveTableCell(startState) !== getActiveTableCell(state)
  ) {
    return buildBlockDecorations(state);
  }

  return previous;
}

/** Block widgets, which only a state field may provide, and the images that are drawn whatever the selection. */
const blockDecorationField = StateField.define<BlockDecorations>({
  create: buildBlockDecorations,
  update: updateBlockDecorations,
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomicRanges),
  ],
});

/** Hides markdown syntax outside the selection so the note reads as rendered text. */
export function markdownPreview(): Extension {
  return [
    ViewPlugin.fromClass(PreviewPlugin, { decorations: (plugin) => plugin.decorations }),
    Prec.high(blockDecorationField),
    activeTableCellField,
  ];
}
