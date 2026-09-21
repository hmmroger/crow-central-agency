import path from "node:path";
import { ENTITY_TYPE, type NoteEntityType } from "@crow-central-agency/shared";

/** Replaces the path separator in a note id — invalid in filenames, so it cannot collide */
const NOTE_ID_SEPARATOR = ":";

/**
 * Derive a note id from a path relative to the notes root. Lowercasing is what
 * makes note identity case-insensitive while disk keeps the original casing.
 */
export function toNoteId(relativePath: string): string {
  return relativePath.split(path.sep).join(NOTE_ID_SEPARATOR).toLowerCase();
}

/** Derive the display name of a node from its cased basename. */
export function toNoteName(entryName: string, entityType: NoteEntityType): string {
  if (entityType === ENTITY_TYPE.NOTE_FOLDER) {
    return entryName;
  }

  return path.basename(entryName, path.extname(entryName));
}
