import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension, type Transaction } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { HTMLVIEW_FENCE_LANG } from "@crow-central-agency/shared";
import { isSelectionTouching } from "./cm-extension-utils.js";
import type { CreateFenceWidget, FenceBlock, FencePreviewState } from "./fence-preview.types.js";
import { HtmlviewWidget } from "./htmlview-widget.js";
import { getFencedCodeLanguage, getFencedCodeParts, getFencedCodeText } from "./markdown-syntax.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import { MERMAID_FENCE_LANG, MermaidWidget } from "./mermaid-widget.js";

const WIDGET_BY_LANGUAGE = new Map<string, CreateFenceWidget>([
  [MERMAID_FENCE_LANG, (source) => new MermaidWidget(source)],
  [HTMLVIEW_FENCE_LANG, (source) => new HtmlviewWidget(source)],
]);

/** A block widget must cover whole lines, so only fences that open their line are drawn; others stay code. */
function toFenceBlock(fencedCode: SyntaxNode, state: EditorState): FenceBlock | undefined {
  const openLine = state.doc.lineAt(fencedCode.from);
  const isOpeningLine = openLine.text.slice(0, fencedCode.from - openLine.from).trim() === "";
  const language = getFencedCodeLanguage(state, fencedCode);
  const createWidget = language === undefined ? undefined : WIDGET_BY_LANGUAGE.get(language);

  if (!isOpeningLine || !getFencedCodeParts(fencedCode)?.closeMark || !createWidget) {
    return undefined;
  }

  return {
    from: openLine.from,
    to: state.doc.lineAt(fencedCode.to).to,
    source: getFencedCodeText(state, fencedCode),
    createWidget,
  };
}

function findFenceBlocks(state: EditorState): FenceBlock[] {
  const blocks: FenceBlock[] = [];

  syntaxTree(state).iterate({
    enter: (nodeRef) => {
      if (nodeRef.name === SYNTAX_NODE.FENCED_CODE) {
        const block = toFenceBlock(nodeRef.node, state);

        if (block) {
          blocks.push(block);
        }
      }

      return nodeRef.name !== SYNTAX_NODE.FENCED_CODE && nodeRef.name !== SYNTAX_NODE.PARAGRAPH;
    },
  });

  return blocks;
}

function buildPreviewState(blocks: FenceBlock[], state: EditorState): FencePreviewState {
  const revealed = blocks.map((block) => isSelectionTouching(state, block.from, block.to));
  const decorations = Decoration.set(
    blocks
      .filter((_block, index) => !revealed[index])
      .map((block) =>
        Decoration.replace({ widget: block.createWidget(block.source), block: true }).range(block.from, block.to)
      )
  );

  return { blocks, revealed, decorations };
}

function isRevealedUnchanged(previous: FencePreviewState, state: EditorState): boolean {
  return previous.blocks.every(
    (block, index) => isSelectionTouching(state, block.from, block.to) === previous.revealed[index]
  );
}

/**
 * Only a document or parse change walks the tree for previewed fences. A selection change re-checks the
 * known blocks and rebuilds decorations only when one is entered or left; widgets compare by source,
 * so an unchanged preview is never re-rendered.
 */
function updatePreviewState(previous: FencePreviewState, transaction: Transaction): FencePreviewState {
  const { state } = transaction;

  if (transaction.docChanged || syntaxTree(transaction.startState) !== syntaxTree(state)) {
    return buildPreviewState(findFenceBlocks(state), state);
  }

  if (!transaction.selection || isRevealedUnchanged(previous, state)) {
    return previous;
  }

  return buildPreviewState(previous.blocks, state);
}

/** Draws mermaid fences as diagrams and htmlview fences as embeds while the selection is outside them. */
export function fencePreview(): Extension {
  return StateField.define<FencePreviewState>({
    create: (state) => buildPreviewState(findFenceBlocks(state), state),
    update: updatePreviewState,
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });
}
