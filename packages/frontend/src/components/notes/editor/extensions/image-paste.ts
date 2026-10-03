import { StateEffect, StateField, type Extension, type Transaction } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { escapeWikilinkTarget, NOTE_IMAGE_ASSET_MIME_TYPES, type NoteMetadata } from "@crow-central-agency/shared";
import { unwrapResponse, uploadNoteAsset } from "../../../../services/api-client.js";
import { queryClient } from "../../../../services/query-client.js";
import { noteKeys } from "../../../../services/query-keys.js";
import { getErrorMessage } from "../../../../utils/error-message.js";
import { toShortestWikilinkTarget } from "../../../../utils/wikilink-resolver.js";
import { getCurrentNoteId } from "./current-note-state.js";
import { showEditorError } from "./editor-error-state.js";
import type { PendingImagePaste } from "./image-paste.types.js";

const PLAIN_TEXT_MIME_TYPE = "text/plain";
const IMAGE_MIME_PREFIX = "image/";
const PASTE_USER_EVENT = "input.paste";
const UNSUPPORTED_IMAGE_MESSAGE = "Only PNG, JPEG, GIF and WebP images can be pasted";

const startImagePaste = StateEffect.define<PendingImagePaste>();
const finishImagePaste = StateEffect.define<number>();

let nextPasteId = 0;

function isAcceptedImage(file: File): boolean {
  return NOTE_IMAGE_ASSET_MIME_TYPES.has(file.type);
}

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

/** The tree the new note has to be unique in, fetched after the upload so it includes it. */
async function readTreeWithNote(note: NoteMetadata): Promise<NoteMetadata[]> {
  await queryClient.invalidateQueries({ queryKey: noteKeys.tree() });
  const notes = queryClient.getQueryData<NoteMetadata[]>(noteKeys.tree()) ?? [];

  return notes.some((metadata) => metadata.id === note.id) ? notes : notes.concat(note);
}

/** Pasting an image uploads it next to the note and inserts `![[target]]` where it was pasted. */
class ImagePastePlugin {
  private isDestroyed = false;

  constructor(private readonly view: EditorView) {}

  public destroy(): void {
    this.isDestroyed = true;
  }

  /** Only a clipboard with an image and no text is an image paste; anything else pastes as before. */
  public handlePaste(event: ClipboardEvent): boolean {
    const clipboard = event.clipboardData;
    const noteId = getCurrentNoteId(this.view.state);

    if (!clipboard || noteId === undefined || clipboard.getData(PLAIN_TEXT_MIME_TYPE)) {
      return false;
    }

    const files = Array.from(clipboard.files);
    const image = files.find(isAcceptedImage);

    if (!image) {
      if (!files.some((file) => file.type.startsWith(IMAGE_MIME_PREFIX))) {
        return false;
      }

      event.preventDefault();
      showEditorError(this.view, UNSUPPORTED_IMAGE_MESSAGE);

      return true;
    }

    event.preventDefault();
    void this.upload(noteId, image);

    return true;
  }

  private async upload(noteId: string, image: File): Promise<void> {
    const { from, to } = this.view.state.selection.main;
    const id = nextPasteId++;

    this.view.dispatch({
      changes: { from, to },
      selection: { anchor: from },
      effects: startImagePaste.of({ id, position: from }),
      userEvent: PASTE_USER_EVENT,
    });

    try {
      const note = unwrapResponse(await uploadNoteAsset(noteId, image));
      const target = toShortestWikilinkTarget(await readTreeWithNote(note), note);
      this.insertEmbed(id, `![[${escapeWikilinkTarget(target)}]]`);
    } catch (error) {
      if (!this.isDestroyed) {
        this.view.dispatch({ effects: finishImagePaste.of(id) });
        showEditorError(this.view, getErrorMessage(error));
      }
    }
  }

  private insertEmbed(id: number, embed: string): void {
    const paste = this.isDestroyed
      ? undefined
      : this.view.state.field(pendingPastesField).find((pending) => pending.id === id);

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

/** Image paste for the current note; install it before the text paste handler so an image is claimed first. */
export function imagePaste(): Extension {
  return [
    pendingPastesField,
    ViewPlugin.define((view) => new ImagePastePlugin(view), {
      eventHandlers: {
        paste(event) {
          return this.handlePaste(event);
        },
      },
    }),
  ];
}
