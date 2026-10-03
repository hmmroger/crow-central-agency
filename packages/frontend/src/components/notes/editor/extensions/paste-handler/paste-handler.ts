import { StateEffect, StateField, type Extension, type Transaction } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { escapeWikilinkTarget, NOTE_IMAGE_ASSET_MIME_TYPES } from "@crow-central-agency/shared";
import { unwrapResponse, uploadNoteAsset } from "../../../../../services/api-client.js";
import { getErrorMessage } from "../../../../../utils/error-message.js";
import { getCurrentNoteId } from "../current-note-state.js";
import { showEditorError } from "../editor-error-state.js";
import { convertHtmlToMarkdown, hasMarkdownStructure, sanitizePastedHtml } from "./html-to-markdown.js";
import type { PendingImagePaste } from "./paste-handler.types.js";

const HTML_MIME_TYPE = "text/html";
const PLAIN_TEXT_MIME_TYPE = "text/plain";
const IMAGE_MIME_PREFIX = "image/";
const SHIFT_KEY = "Shift";
const PASTE_USER_EVENT = "input.paste";
const UNSUPPORTED_IMAGE_MESSAGE = "Only PNG, JPEG, GIF and WebP images can be pasted";

const startImagePaste = StateEffect.define<PendingImagePaste>();
const finishImagePaste = StateEffect.define<number>();

let nextPasteId = 0;

function applyEffect(pending: PendingImagePaste[], effect: StateEffect<unknown>): PendingImagePaste[] {
  if (effect.is(startImagePaste)) {
    return pending.concat(effect.value);
  }

  if (effect.is(finishImagePaste)) {
    return pending.filter((paste) => paste.id !== effect.value);
  }

  return pending;
}

/** Positions ride along with every edit; an image whose spot was deleted lands where the deletion was. */
function updatePendingPastes(pending: PendingImagePaste[], transaction: Transaction): PendingImagePaste[] {
  const mapped = transaction.docChanged
    ? pending.map((paste) => ({ id: paste.id, position: transaction.changes.mapPos(paste.position, -1) }))
    : pending;

  return transaction.effects.reduce(applyEffect, mapped);
}

const pendingPastesField = StateField.define<PendingImagePaste[]>({
  create: () => [],
  update: updatePendingPastes,
});

/**
 * A pasted image is uploaded next to the note and inserted as `![[target]]`. Pasted HTML is sanitized and
 * converted to markdown; plain text, and HTML that only carries styling, goes through CodeMirror's own paste
 * untouched. A ClipboardEvent has no `shiftKey`, so Shift is tracked from key events to let Shift-paste prefer
 * plain text.
 */
class PastePlugin {
  public isShiftHeld = false;

  constructor(private readonly view: EditorView) {}

  public handlePaste(event: ClipboardEvent): boolean {
    const clipboard = event.clipboardData;

    if (!clipboard) {
      return false;
    }

    return this.pasteImage(event, clipboard) || this.pasteHtml(event, clipboard);
  }

  /** Only a clipboard with an image and no text is an image paste. */
  private pasteImage(event: ClipboardEvent, clipboard: DataTransfer): boolean {
    const noteId = getCurrentNoteId(this.view.state);

    if (noteId === undefined || clipboard.getData(PLAIN_TEXT_MIME_TYPE)) {
      return false;
    }

    const files = Array.from(clipboard.files);
    const image = files.find((file) => NOTE_IMAGE_ASSET_MIME_TYPES.has(file.type));

    if (!image) {
      if (!files.some((file) => file.type.startsWith(IMAGE_MIME_PREFIX))) {
        return false;
      }

      event.preventDefault();
      showEditorError(this.view, UNSUPPORTED_IMAGE_MESSAGE);

      return true;
    }

    event.preventDefault();
    void this.uploadImage(noteId, image);

    return true;
  }

  private pasteHtml(event: ClipboardEvent, clipboard: DataTransfer): boolean {
    const html = clipboard.getData(HTML_MIME_TYPE);
    const plainText = clipboard.getData(PLAIN_TEXT_MIME_TYPE);

    if (!html || (this.isShiftHeld && plainText)) {
      return false;
    }

    const sanitizedHtml = sanitizePastedHtml(html);

    if (plainText && !hasMarkdownStructure(sanitizedHtml)) {
      return false;
    }

    const markdown = convertHtmlToMarkdown(sanitizedHtml);

    if (!markdown.trim()) {
      return false;
    }

    event.preventDefault();
    this.view.dispatch(this.view.state.replaceSelection(markdown), {
      userEvent: PASTE_USER_EVENT,
      scrollIntoView: true,
    });

    return true;
  }

  private async uploadImage(noteId: string, image: File): Promise<void> {
    const { from, to } = this.view.state.selection.main;
    const id = nextPasteId++;

    this.view.dispatch({
      changes: { from, to },
      selection: { anchor: from },
      effects: startImagePaste.of({ id, position: from }),
      userEvent: PASTE_USER_EVENT,
    });

    try {
      const { target } = unwrapResponse(await uploadNoteAsset(noteId, image));
      this.insertEmbed(id, `![[${escapeWikilinkTarget(target)}]]`);
    } catch (error) {
      this.view.dispatch({ effects: finishImagePaste.of(id) });
      showEditorError(this.view, getErrorMessage(error));
    }
  }

  private insertEmbed(id: number, embed: string): void {
    const paste = this.view.state.field(pendingPastesField).find((pending) => pending.id === id);

    if (!paste) {
      return;
    }

    const { main } = this.view.state.selection;
    const isCursorAtPaste = main.empty && main.head === paste.position;

    this.view.dispatch({
      changes: { from: paste.position, insert: embed },
      selection: isCursorAtPaste ? { anchor: paste.position + embed.length } : undefined,
      effects: finishImagePaste.of(id),
      userEvent: PASTE_USER_EVENT,
      scrollIntoView: isCursorAtPaste,
    });
  }
}

export function pasteHandler(): Extension {
  return [
    pendingPastesField,
    ViewPlugin.fromClass(PastePlugin, {
      eventHandlers: {
        keydown(event) {
          if (event.key === SHIFT_KEY) {
            this.isShiftHeld = true;
          }
        },
        keyup(event) {
          if (event.key === SHIFT_KEY) {
            this.isShiftHeld = false;
          }
        },
        blur() {
          this.isShiftHeld = false;
        },
        paste(event) {
          return this.handlePaste(event);
        },
      },
    }),
  ];
}
