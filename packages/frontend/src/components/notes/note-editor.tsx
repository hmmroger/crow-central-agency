import { useCallback, useEffect, useRef } from "react";
import type { NoteFileMetadata } from "@crow-central-agency/shared";
import { useNoteContentQuery } from "../../hooks/queries/use-note-content-query.js";
import { useWriteNoteContent } from "../../hooks/queries/use-note-mutations.js";
import { EDITOR_STATUS_TONE, type EditorStatusAlert } from "./editor-status-bar.types.js";
import { MarkdownEditor } from "./markdown-editor.js";

interface NoteEditorProps {
  note: NoteFileMetadata;
  /** Reports whether the draft is still ahead of the backend, for the note header */
  onUnsavedChange: (isUnsaved: boolean) => void;
}

const CONFLICT_ERROR_CODE = "conflict";
const CONFLICT_MESSAGE = "This note changed on disk and was reloaded. Unsaved edits were not written.";
const AUTO_SAVE_DELAY_MS = 1000;

function getStatusAlert(isConflict: boolean, saveErrorMessage?: string): EditorStatusAlert | undefined {
  if (isConflict) {
    return { message: CONFLICT_MESSAGE, tone: EDITOR_STATUS_TONE.WARNING };
  }

  return saveErrorMessage === undefined ? undefined : { message: saveErrorMessage, tone: EDITOR_STATUS_TONE.ERROR };
}

/**
 * Editing surface for a live text note. Edits auto-save once typing pauses and
 * flush on blur, Cmd/Ctrl+S and unmount. Each save sends the loaded
 * `updatedTimestamp` and adopts the token the backend returns; only a conflict
 * reseeds the editor.
 */
export function NoteEditor({ note, onUnsavedChange }: NoteEditorProps) {
  const { data, isLoading, isError, error, refetch } = useNoteContentQuery(note);
  const { mutateAsync: writeContent, isError: isSaveError, error: saveError } = useWriteNoteContent();
  const draftRef = useRef("");
  const tokenRef = useRef(note.updatedTimestamp);
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const needsResaveRef = useRef(false);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const loadedMarkdown = data?.type === "text" ? data.content : undefined;
  const loadedTimestamp = data?.type === "text" ? data.updatedTimestamp : undefined;
  const isConflict = isSaveError && saveError.code === CONFLICT_ERROR_CODE;

  useEffect(() => {
    if (loadedTimestamp !== undefined) {
      tokenRef.current = loadedTimestamp;
      draftRef.current = loadedMarkdown ?? "";
      isDirtyRef.current = false;
      onUnsavedChange(false);
    }
  }, [loadedMarkdown, loadedTimestamp, onUnsavedChange]);

  // A stale token means the file moved on underneath us: pull the current
  // version back in rather than letting the editor keep a doomed draft.
  useEffect(() => {
    if (isConflict) {
      void refetch();
    }
  }, [isConflict, refetch]);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void saveRef.current(), AUTO_SAVE_DELAY_MS);
  }, []);

  const flushSave = useCallback(() => {
    window.clearTimeout(saveTimerRef.current);
    void saveRef.current();
  }, []);

  const save = useCallback(async () => {
    if (!isDirtyRef.current) {
      return;
    }

    // A second write while one is in flight would carry the superseded token, so
    // hand the draft to the save already running. Awaiting the mutation rather
    // than using its callbacks keeps that handover working past unmount, where
    // react-query stops delivering per-call callbacks.
    if (isSavingRef.current) {
      needsResaveRef.current = true;

      return;
    }

    const content = draftRef.current;
    isSavingRef.current = true;

    const saved = await writeContent({
      noteId: note.id,
      input: { content, updatedTimestamp: tokenRef.current },
    }).catch(() => undefined);

    isSavingRef.current = false;

    if (saved === undefined) {
      needsResaveRef.current = false;

      return;
    }

    tokenRef.current = saved.updatedTimestamp;

    if (draftRef.current === content) {
      isDirtyRef.current = false;
      onUnsavedChange(false);
    }

    if (needsResaveRef.current) {
      needsResaveRef.current = false;
      await saveRef.current();
    }
  }, [writeContent, note.id, onUnsavedChange]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimerRef.current);
      void saveRef.current();
    };
  }, []);

  const handleChange = useCallback(
    (markdown: string) => {
      draftRef.current = markdown;
      isDirtyRef.current = true;
      onUnsavedChange(true);
      scheduleSave();
    },
    [scheduleSave, onUnsavedChange]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        flushSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flushSave]);

  if (isLoading) {
    return <p className="p-panel text-sm text-text-muted">Loading...</p>;
  }

  if (isError) {
    return <p className="p-panel text-sm text-error">{error.message}</p>;
  }

  if (loadedMarkdown === undefined || loadedTimestamp === undefined) {
    return <p className="p-panel text-sm text-text-muted">No content</p>;
  }

  return (
    <MarkdownEditor
      key={loadedTimestamp}
      noteId={note.id}
      markdown={loadedMarkdown}
      onChange={handleChange}
      onBlur={flushSave}
      alert={getStatusAlert(isConflict, isSaveError ? saveError.message : undefined)}
      ariaLabel={`Edit note ${note.name}`}
    />
  );
}
