import { useCallback, useMemo, useState } from "react";
import { useNoteMoveDestinationsQuery } from "../../hooks/queries/use-note-move-destinations-query.js";
import { useNotesContext } from "../../providers/notes-provider.js";
import { useAppStore } from "../../stores/app-store.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { buildNoteNodes, buildNoteRootTree, NOTES_ROOT_NODE_ID } from "../../utils/note-tree.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { Tree } from "../common/tree/tree.js";

interface NoteMoveDialogProps {
  /** Note being moved */
  noteId: string;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

const DEFAULT_EXPANDED_IDS = [NOTES_ROOT_NODE_ID];

/**
 * Destination picker for a move. Only the folders the backend offers are
 * listed, so none that would swallow the note itself; the notes root is the
 * tree's top node.
 */
export function NoteMoveDialog({ noteId, onClose }: NoteMoveDialogProps) {
  const { getNote, getChildIds, updateNote } = useNotesContext();
  const selectNote = useAppStore((state) => state.selectNote);
  const note = getNote(noteId);
  const { data: destinations } = useNoteMoveDestinationsQuery(noteId);
  const [destinationId, setDestinationId] = useState(note?.parentId);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string>();
  const selectedNodeId = destinationId ?? NOTES_ROOT_NODE_ID;
  const isUnchanged = destinationId === note?.parentId;

  const nodes = useMemo(() => {
    const destinationIds = new Set(destinations?.map((folder) => folder.id));

    return buildNoteRootTree(
      buildNoteNodes({ getNote, getChildIds }, undefined, false, (candidateId) => destinationIds.has(candidateId))
    );
  }, [destinations, getNote, getChildIds]);

  const handleSelect = useCallback((nodeId: string) => {
    setDestinationId(nodeId === NOTES_ROOT_NODE_ID ? undefined : nodeId);
  }, []);

  const handleMove = useCallback(async () => {
    setError(undefined);
    setIsMoving(true);

    try {
      // `null` moves to the root; `undefined` would read as "parent unchanged".
      selectNote(await updateNote(noteId, { parentId: destinationId ?? null }));
      onClose();
    } catch (moveError) {
      setError(getErrorMessage(moveError));
      setIsMoving(false);
    }
  }, [updateNote, noteId, destinationId, selectNote, onClose]);

  if (!note) {
    return null;
  }

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-3">
        <p className="text-sm text-text-neutral">
          Move <span className="text-text-base">{note.name}</span> to another folder.
        </p>

        <div className="h-80 overflow-y-auto rounded-md border border-border-subtle p-1">
          <Tree
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
        <ActionButton label="Cancel" onClick={onClose} disabled={isMoving} />
        <ActionButton
          label={isMoving ? "Moving..." : "Move"}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          disabled={isUnchanged || isMoving}
          onClick={handleMove}
        />
      </div>
    </div>
  );
}
