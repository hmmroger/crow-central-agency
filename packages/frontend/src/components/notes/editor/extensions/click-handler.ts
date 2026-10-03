import { Facet, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import { toggleTask } from "../markdown-commands.js";
import type { MarkdownEditorProps } from "../markdown-editor.types.js";
import { moveTableCell } from "../table-commands.js";
import { findSyntaxAncestor } from "./cm-extension-utils.js";
import { FENCE_PREVIEW_CLASS } from "./fence-preview-widget.js";
import { LINK_CLASS, LINK_URL_ATTRIBUTE, WIKILINK_CLASS, WIKILINK_TARGET_ATTRIBUTE } from "./inline-decorators.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import { getActiveTableCell } from "./table/table-cell-state.js";
import { TASK_CHECKBOX_CLASS } from "./task-checkbox-widget.js";
import { getWikilinkResolutions } from "./wikilink-resolution-state.js";

type WikilinkOpenHandler = MarkdownEditorProps["onWikilinkOpen"];

export const PRIMARY_BUTTON = 0;

const MODIFIER_HELD_CLASS = "cm-md-modifier-held";
const OPENABLE_PROTOCOLS = new Set(["http:", "https:"]);

const wikilinkOpenFacet = Facet.define<WikilinkOpenHandler, WikilinkOpenHandler | undefined>({
  combine: (handlers) => handlers[0],
});

function isOpenModifierHeld(event: MouseEvent | KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function showModifierHeld(view: EditorView, isHeld: boolean): boolean {
  view.dom.classList.toggle(MODIFIER_HELD_CLASS, isHeld);

  return false;
}

/** Only absolute http(s) URLs open; anything relative or with another scheme stays inert. */
function toOpenableUrl(url: string): string | undefined {
  const parsed = URL.parse(url);

  return parsed && OPENABLE_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
}

/** Opens a link's URL in a new tab. */
function openUrl(event: MouseEvent, element: Element): boolean {
  const url = element.closest(`.${LINK_CLASS}`)?.getAttribute(LINK_URL_ATTRIBUTE);
  const openableUrl = url ? toOpenableUrl(url) : undefined;

  if (!openableUrl) {
    return false;
  }

  event.preventDefault();
  window.open(openableUrl, "_blank", "noopener,noreferrer");

  return true;
}

/** Asks the host to open a wikilink, with the note it names when that is already known; a folder is left alone. */
function openWikilink(event: MouseEvent, element: Element, view: EditorView): boolean {
  const handler = view.state.facet(wikilinkOpenFacet);
  const target = element.closest(`.${WIKILINK_CLASS}`)?.getAttribute(WIKILINK_TARGET_ATTRIBUTE);

  if (!handler || !target) {
    return false;
  }

  const note = getWikilinkResolutions(view.state).get(target);

  if (note?.entityType === ENTITY_TYPE.NOTE_FOLDER) {
    return false;
  }

  event.preventDefault();
  handler({ target, noteId: note?.id });

  return true;
}

/** Ctrl/Cmd + primary click on a link or wikilink opens it. */
export function openLinkUnderPointer(event: MouseEvent, view: EditorView): boolean {
  if (!isOpenModifierHeld(event) || event.button !== PRIMARY_BUTTON || !(event.target instanceof Element)) {
    return false;
  }

  return openUrl(event, event.target) || openWikilink(event, event.target, view);
}

/** A click in the note's text leaves the active table cell, writing its pending edit first. */
function leaveTableCell(view: EditorView): boolean {
  if (getActiveTableCell(view.state)) {
    moveTableCell(view, undefined);
  }

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
 * Ctrl/Cmd + click opens a link, or hands a wikilink to `onWikilinkOpen`; a click on a checkbox toggles its
 * task and a click on a diagram or embed selects its source; otherwise a click places the cursor.
 */
export function clickHandler(onWikilinkOpen: WikilinkOpenHandler): Extension {
  return [
    wikilinkOpenFacet.of(onWikilinkOpen),
    EditorView.domEventHandlers({
      keydown: (event, view) => showModifierHeld(view, isOpenModifierHeld(event)),
      keyup: (event, view) => showModifierHeld(view, isOpenModifierHeld(event)),
      mousemove: (event, view) => showModifierHeld(view, isOpenModifierHeld(event)),
      mouseleave: (_event, view) => showModifierHeld(view, false),
      blur: (_event, view) => showModifierHeld(view, false),
      mousedown: (event, view) =>
        leaveTableCell(view) ||
        openLinkUnderPointer(event, view) ||
        toggleTaskUnderPointer(event, view) ||
        selectFencePreviewUnderPointer(event, view),
    }),
  ];
}
