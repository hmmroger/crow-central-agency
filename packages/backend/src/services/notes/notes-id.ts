import path from "node:path";
import { ENTITY_TYPE, NOTE_CONTENT_TYPE, type NoteEntityType } from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { detectNoteContentType } from "./notes-content-detector.js";

/** Replaces the path separator in a note id — invalid in filenames, so it cannot collide */
const NOTE_ID_SEPARATOR = ":";

/** Separates the folder segments and the note name in a wikilink target */
export const WIKILINK_TARGET_SEPARATOR = "/";

function isTextNoteFilename(filename: string): boolean {
  return detectNoteContentType(filename) === NOTE_CONTENT_TYPE.TEXT;
}

/** The form note names compare in; names match case-insensitively. */
export function toComparableNoteName(name: string): string {
  return name.toLowerCase();
}

export function isSameNoteName(name: string, otherName: string): boolean {
  return toComparableNoteName(name) === toComparableNoteName(otherName);
}

/** A wikilink target's `/`-separated segments, blank ones dropped; the last is the note's name. */
export function toWikilinkTargetSegments(target: string): string[] {
  return target
    .split(WIKILINK_TARGET_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * Derive a note id from a path relative to the notes root. Lowercasing is what
 * makes note identity case-insensitive while disk keeps the original casing.
 */
export function toNoteId(relativePath: string): string {
  return relativePath.split(path.sep).join(NOTE_ID_SEPARATOR).toLowerCase();
}

/** Derive the display name of a note from its cased basename; only markdown hides its extension. */
export function toNoteName(entryName: string, entityType: NoteEntityType): string {
  if (entityType === ENTITY_TYPE.NOTE && isTextNoteFilename(entryName)) {
    return path.basename(entryName, path.extname(entryName));
  }

  return entryName;
}

/**
 * The filename a renamed note takes. A text note keeps its markdown extension;
 * any other note is named by its full filename, whose extension cannot change
 * because it decides the content type.
 * @throws AppError VALIDATION when a non-markdown note's extension would change.
 */
export function toRenamedNoteFilename(currentFilename: string, name: string): string {
  const currentExtension = path.extname(currentFilename);
  if (isTextNoteFilename(currentFilename)) {
    return `${name}${currentExtension}`;
  }

  if (path.extname(name).toLowerCase() !== currentExtension.toLowerCase()) {
    const message = currentExtension
      ? `The file extension cannot be changed; keep "${currentExtension}" at the end of the name`
      : "The file extension cannot be changed; this file has none";

    throw new AppError(message, APP_ERROR_CODES.VALIDATION);
  }

  return name;
}
