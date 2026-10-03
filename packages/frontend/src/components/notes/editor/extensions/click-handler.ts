import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { toggleTask } from "../markdown-commands.js";
import { findSyntaxAncestor } from "./cm-extension-utils.js";
import { isOpenModifierHeld, openLinkUnderPointer, PRIMARY_BUTTON } from "./link-open.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import { FENCE_PREVIEW_CLASS } from "./fence-preview.types.js";
import { TASK_CHECKBOX_CLASS } from "./task-checkbox-widget.js";
import { openWikilinkUnderPointer } from "./wikilink-open.js";

const MODIFIER_HELD_CLASS = "cm-md-modifier-held";

function showModifierHeld(view: EditorView, isHeld: boolean): boolean {
  view.dom.classList.toggle(MODIFIER_HELD_CLASS, isHeld);

  return false;
}

/** Handled on mousedown so the click neither moves the cursor onto the task nor reveals its syntax. */
function toggleTaskUnderPointer(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== PRIMARY_BUTTON || !(event.target instanceof Element)) {
    return false;
  }

  const checkbox = event.target.closest(`.${TASK_CHECKBOX_CLASS}`);

  if (!checkbox) {
    return false;
  }

  event.preventDefault();

  return toggleTask(view, view.posAtDOM(checkbox));
}

/** Selects the whole fence behind a diagram or embed, which reveals its source for editing. */
function selectFencePreviewUnderPointer(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== PRIMARY_BUTTON || !(event.target instanceof Element)) {
    return false;
  }

  const preview = event.target.closest(`.${FENCE_PREVIEW_CLASS}`);
  const openLineEnd = preview ? view.state.doc.lineAt(view.posAtDOM(preview)).to : undefined;
  const fencedCode =
    openLineEnd === undefined ? undefined : findSyntaxAncestor(view.state, openLineEnd, SYNTAX_NODE.FENCED_CODE);

  if (!fencedCode) {
    return false;
  }

  event.preventDefault();
  view.dispatch({ selection: { anchor: fencedCode.from, head: fencedCode.to } });
  view.focus();

  return true;
}

/**
 * Ctrl/Cmd + click opens a link or wikilink, a click on a checkbox toggles its task and a click on a
 * diagram or embed selects its source; otherwise a click places the cursor.
 */
export function clickHandler(): Extension {
  return EditorView.domEventHandlers({
    keydown: (event, view) => showModifierHeld(view, isOpenModifierHeld(event)),
    keyup: (event, view) => showModifierHeld(view, isOpenModifierHeld(event)),
    mousemove: (event, view) => showModifierHeld(view, isOpenModifierHeld(event)),
    mouseleave: (_event, view) => showModifierHeld(view, false),
    blur: (_event, view) => showModifierHeld(view, false),
    mousedown: (event, view) =>
      openLinkUnderPointer(event) ||
      openWikilinkUnderPointer(event, view) ||
      toggleTaskUnderPointer(event, view) ||
      selectFencePreviewUnderPointer(event, view),
  });
}
