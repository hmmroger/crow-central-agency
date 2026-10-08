import { ENTITY_TYPE, type NoteFileMetadata, type NoteMetadata } from "@crow-central-agency/shared";

/** A note in the live tree that is a file, not a folder */
export function isLiveNoteFile(metadata: NoteMetadata | undefined): metadata is NoteFileMetadata {
  return metadata !== undefined && metadata.entityType === ENTITY_TYPE.NOTE && !metadata.isTrashed;
}
