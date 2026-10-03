import { syntaxTree } from "@codemirror/language";
import { Prec, StateField, type EditorState, type Extension, type Range, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { readImageSyntax, resolveImageSyntax } from "./image-syntax.js";
import { ImageWidget } from "./image-widget.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import { getNotesTree } from "./notes-tree-state.js";

function buildImageDecorations(state: EditorState): DecorationSet {
  const notes = getNotesTree(state);
  const decorations: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (nodeRef) => {
      // A top-level table is a grid widget that draws its own cell images.
      if (nodeRef.name === SYNTAX_NODE.TABLE && nodeRef.node.parent?.type.isTop) {
        return false;
      }

      const image = readImageSyntax(nodeRef.node, state);

      if (!image) {
        return undefined;
      }

      decorations.push(
        Decoration.replace({ widget: new ImageWidget(image.source, resolveImageSyntax(image, notes)) }).range(
          image.from,
          image.to
        )
      );

      return false;
    },
  });

  return Decoration.set(decorations, true);
}

/** Images do not depend on the selection, so only a document, parse or notes-tree change rebuilds them. */
function updateImageDecorations(decorations: DecorationSet, transaction: Transaction): DecorationSet {
  const { startState, state } = transaction;

  if (
    transaction.docChanged ||
    syntaxTree(startState) !== syntaxTree(state) ||
    getNotesTree(startState) !== getNotesTree(state)
  ) {
    return buildImageDecorations(state);
  }

  return decorations;
}

const imageDecorationsField = StateField.define<DecorationSet>({
  create: buildImageDecorations,
  update: updateImageDecorations,
  provide: (field) => [
    EditorView.decorations.from(field),
    // Atomic, so the cursor steps over an image, a selection takes it whole and a delete removes all of it.
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

/** Draws `![[target]]` and http/https `![alt](url)` as images that stay images wherever the cursor goes. */
export function imagePreview(): Extension {
  // Ahead of the preview's decorations, so a link's mark wraps the image it holds and Ctrl/Cmd + click opens it.
  return Prec.high(imageDecorationsField);
}
