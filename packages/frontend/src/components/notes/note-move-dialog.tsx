import { useCallback, useMemo, useState } from "react";
import { FolderTree } from "lucide-react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNotesQuery } from "../../hooks/queries/use-notes-query.js";
import { useUpdateNote } from "../../hooks/queries/use-note-mutations.js";
import { getMoveDestinations } from "../../utils/note-tree.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { cn } from "../../utils/cn.js";
import { NoteTree } from "./note-tree.js";

interface NoteMoveDialogProps {
  /** Note being moved */
  note: NoteMetadata;
  /** Called with the moved note once the backend has re-keyed it */
  onMoved: (metadata: NoteMetadata) => void;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

const ROOT_DESTINATION_LABEL = "Notes root";

/**
 * Destination picker for a move. Folders that would swallow the note itself
 * are left out; the notes root is offered as an explicit row.
 */
export function NoteMoveDialog({ note, onMoved, onClose }: NoteMoveDialogProps) {
  const { data: notes = [] } = useNotesQuery();
  const { mutateAsync: updateNote, isPending } = useUpdateNote();
  const [destinationId, setDestinationId] = useState(note.parentId);
  const [error, setError] = useState<string>();
  const destinations = useMemo(() => getMoveDestinations(notes, note), [notes, note]);
  const isUnchanged = destinationId === note.parentId;

  const handleSelect = useCallback((metadata: NoteMetadata) => {
    setDestinationId(metadata.id);
  }, []);

  const handleSelectRoot = useCallback(() => {
    setDestinationId(undefined);
  }, []);

  const handleMove = useCallback(async () => {
    setError(undefined);

    try {
      // `null` moves to the root; `undefined` would read as "parent unchanged".
      const moved = await updateNote({ noteId: note.id, input: { parentId: destinationId ?? null } });
      onMoved(moved);
      onClose();
    } catch (moveError) {
      setError(getErrorMessage(moveError));
    }
  }, [updateNote, note.id, destinationId, onMoved, onClose]);

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-3">
        <p className="text-sm text-text-neutral">
          Move <span className="text-text-base">{note.name}</span> to another folder.
        </p>

        <div className="h-80 overflow-y-auto rounded-md border border-border-subtle p-1">
          <button
            type="button"
            aria-current={destinationId === undefined}
            className={cn(
              "w-full flex items-center gap-1.5 px-2 py-1 rounded-sm text-sm text-left transition-colors",
              destinationId === undefined
                ? "bg-surface-hover text-text-base"
                : "text-text-neutral hover:bg-surface-hover"
            )}
            onClick={handleSelectRoot}
          >
            <FolderTree className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="truncate">{ROOT_DESTINATION_LABEL}</span>
          </button>

          <NoteTree notes={destinations} selectedId={destinationId} onSelect={handleSelect} />
        </div>

        {error && <p className="text-xs text-error">{error}</p>}
      </div>

      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} disabled={isPending} />
        <ActionButton
          label={isPending ? "Moving..." : "Move"}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          disabled={isUnchanged || isPending}
          onClick={handleMove}
        />
      </div>
    </div>
  );
}
