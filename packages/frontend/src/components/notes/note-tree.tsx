import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { buildNoteTree, collectAncestorIds } from "../../utils/note-tree.js";
import { NoteTreeItem } from "./note-tree-item.js";
import type { NoteTreeAction } from "./note-tree.types.js";

interface NoteTreeProps {
  /** Flat note metadata as served by the backend */
  notes: NoteMetadata[];
  selectedId?: string;
  /** Note to bring into view: its ancestors are expanded when it changes */
  revealId?: string;
  /** Row-level controls offered on each note */
  actions?: readonly NoteTreeAction[];
  onSelect: (metadata: NoteMetadata) => void;
}

/**
 * Browsable note tree composed from a flat metadata list. Expansion is local
 * display state; selection is owned by the consumer.
 */
export function NoteTree({ notes, selectedId, revealId, actions, onSelect }: NoteTreeProps) {
  const tree = useMemo(() => buildNoteTree(notes), [notes]);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const revealedIdRef = useRef<string>(undefined);

  // A note created, renamed or moved elsewhere in the tree is worth nothing if
  // its folder is still collapsed. Each note is revealed once, so a folder the
  // user folds afterwards stays folded through later tree refreshes.
  useEffect(() => {
    if (revealId === undefined || revealId === revealedIdRef.current) {
      return;
    }

    // A just-created note arrives only with the refetch that follows it.
    if (!notes.some((metadata) => metadata.id === revealId)) {
      return;
    }

    revealedIdRef.current = revealId;
    const ancestorIds = collectAncestorIds(notes, revealId);
    if (ancestorIds.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const collapsedIds = ancestorIds.filter((ancestorId) => !current.has(ancestorId));
      if (collapsedIds.length === 0) {
        return current;
      }

      const next = new Set(current);
      for (const ancestorId of collapsedIds) {
        next.add(ancestorId);
      }

      return next;
    });
  }, [notes, revealId]);

  const handleToggle = useCallback((noteId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(noteId)) {
        next.add(noteId);
      }

      return next;
    });
  }, []);

  return (
    <ul>
      {tree.map((entry) => (
        <NoteTreeItem
          key={entry.metadata.id}
          entry={entry}
          expandedIds={expandedIds}
          selectedId={selectedId}
          actions={actions}
          onToggle={handleToggle}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
