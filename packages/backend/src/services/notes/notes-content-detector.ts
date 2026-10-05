import path from "node:path";
import { isImageFileExtension, NOTE_CONTENT_TYPE, type NoteContentType } from "@crow-central-agency/shared";

/** Extensions treated as editable markdown notes */
const TEXT_NOTE_EXTENSIONS = new Set([".md", ".markdown"]);

/**
 * Detect a note's content type from its filename extension.
 * Markdown is the only editable form; images render read-only and anything
 * else is unknown.
 */
export function detectNoteContentType(filename: string): NoteContentType {
  const ext = path.extname(filename).toLowerCase();

  if (TEXT_NOTE_EXTENSIONS.has(ext)) {
    return NOTE_CONTENT_TYPE.TEXT;
  }

  if (isImageFileExtension(ext)) {
    return NOTE_CONTENT_TYPE.IMAGE;
  }

  return NOTE_CONTENT_TYPE.UNKNOWN;
}
