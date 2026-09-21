import { useCallback, useMemo, useState } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { buildNoteTree } from "../../utils/note-tree.js";
import { NoteTreeItem } from "./note-tree-item.js";

interface NoteTreeProps {
  /** Flat note metadata as served by the backend */
  nodes: NoteMetadata[];
  selectedId?: string;
  onSelect: (metadata: NoteMetadata) => void;
}

/**
 * Browsable note tree composed from a flat metadata list. Expansion is local
 * display state; selection is owned by the consumer.
 */
export function NoteTree({ nodes, selectedId, onSelect }: NoteTreeProps) {
  const tree = useMemo(() => buildNoteTree(nodes), [nodes]);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  const handleToggle = useCallback((nodeId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(nodeId)) {
        next.add(nodeId);
      }

      return next;
    });
  }, []);

  return (
    <ul>
      {tree.map((node) => (
        <NoteTreeItem
          key={node.metadata.id}
          node={node}
          expandedIds={expandedIds}
          selectedId={selectedId}
          onToggle={handleToggle}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
