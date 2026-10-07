import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { formatLocalDateTime } from "../../utils/date-utils.js";

/** Folders before notes, then by name, so pages stay stable */
export function compareNoteEntries(left: NoteMetadata, right: NoteMetadata): number {
  const leftRank = left.entityType === ENTITY_TYPE.NOTE_FOLDER ? 0 : 1;
  const rightRank = right.entityType === ENTITY_TYPE.NOTE_FOLDER ? 0 : 1;
  return leftRank - rightRank || left.name.localeCompare(right.name);
}

export function formatNoteEntry(entry: NoteMetadata, userTimezone: string): string {
  const updated = formatLocalDateTime(new Date(entry.updatedTimestamp), userTimezone);
  if (entry.entityType === ENTITY_TYPE.NOTE_FOLDER) {
    return `- Id: ${entry.id} (folder) Name: ${entry.name} Updated: ${updated}`;
  }

  return `- Id: ${entry.id} (note, ${entry.contentType}) Name: ${entry.name} Updated: ${updated} Size: ${entry.size} bytes`;
}
