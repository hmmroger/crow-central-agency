import { useCallback, useMemo, useState } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNoteMoveDestinationsQuery } from "../../hooks/queries/use-note-move-destinations-query.js";
import { useUpdateNote } from "../../hooks/queries/use-note-mutations.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { buildNoteRootTree, NOTES_ROOT_NODE_ID } from "../../utils/note-tree.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { TreeView } from "../common/tree-view/tree-view.js";

interface NoteMoveDialogProps {
  /** Note being moved */
  note: NoteMetadata;
  /** Called with the moved note once the backend has re-keyed it */
  onMoved: (metadata: NoteMetadata) => void;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

const DEFAULT_EXPANDED_IDS = [NOTES_ROOT_NODE_ID];

/**
 * Destination picker for a move. Folders that would swallow the note itself
 * are left out; the notes root is the tree's top node.
 */
export function NoteMoveDialog({ note, onMoved, onClose }: NoteMoveDialogProps) {
  const { data: destinations = [] } = useNoteMoveDestinationsQuery(note.id);
  const { mutateAsync: updateNote, isPending } = useUpdateNote();
  const [destinationId, setDestinationId] = useState(note.parentId);
  const [error, setError] = useState<string>();
  const nodes = useMemo(() => buildNoteRootTree(destinations), [destinations]);
  const selectedNodeId = destinationId ?? NOTES_ROOT_NODE_ID;
  const isUnchanged = destinationId === note.parentId;

  const handleSelect = useCallback((metadata: NoteMetadata | undefined) => {
    setDestinationId(metadata?.id);
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
          <TreeView
            nodes={nodes}
            selectedId={selectedNodeId}
            revealId={selectedNodeId}
            defaultExpandedIds={DEFAULT_EXPANDED_IDS}
            onSelect={handleSelect}
            ariaLabel="Destination folders"
          />
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
