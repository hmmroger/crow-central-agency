import { useEffect } from "react";
import { DATA_SOURCE_TYPE, GLOBAL_PROVENANCE_ID } from "@crow-central-agency/shared";
import { useNotesContext } from "../providers/notes-provider.js";
import { useAppStore } from "../stores/app-store.js";
import { isLiveNoteFile } from "../utils/note-utils.js";

/** Single recording site for note recency — call only from the notes view with the Notes tab's open note. */
export function useRecordNoteVisit(noteId: string | undefined) {
  const { getNote } = useNotesContext();
  const recordDocumentVisit = useAppStore((state) => state.recordDocumentVisit);
  const metadata = noteId ? getNote(noteId) : undefined;
  const recordableNoteId = isLiveNoteFile(metadata) ? metadata.id : undefined;

  useEffect(() => {
    if (!recordableNoteId) {
      return;
    }

    recordDocumentVisit({
      documentId: recordableNoteId,
      dataSourceType: DATA_SOURCE_TYPE.NOTE,
      provenanceId: GLOBAL_PROVENANCE_ID,
    });
  }, [recordableNoteId, recordDocumentVisit]);
}
