import { useMemo } from "react";
import { RELATIONSHIP_DIRECTION, type FragmentKind } from "@crow-central-agency/shared";
import { useGraphQuery } from "../../hooks/queries/use-graph-query.js";
import { ActionButton } from "../common/action-button.js";
import { KIND_LABEL } from "./fragment-kind-label.js";
import { FragmentRelationshipRowItem } from "./fragment-relationship-row.js";
import type { FragmentRelationshipRow } from "./fragment-relationships-dialog.types.js";

interface FragmentRelationshipsDialogProps {
  fragmentId: string;
  /** Cue from the known graph node, shown as the dialog subject */
  cue: string;
  kind?: FragmentKind;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Lists a fragment's direct relationship edges, derived from the graph cache.
 * Each row maps 1:1 to a removable edge; the counterpart is shown with its role
 * (parent or child of this fragment).
 */
export function FragmentRelationshipsDialog({ fragmentId, cue, kind, onClose }: FragmentRelationshipsDialogProps) {
  const { data: graph } = useGraphQuery();

  const rows = useMemo<FragmentRelationshipRow[]>(() => {
    if (!graph) {
      return [];
    }

    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

    return graph.edges
      .filter((edge) => edge.source === fragmentId || edge.target === fragmentId)
      .map((edge) => {
        const isTarget = edge.target === fragmentId;

        return {
          relationshipId: edge.id,
          direction: isTarget ? RELATIONSHIP_DIRECTION.TARGET : RELATIONSHIP_DIRECTION.SOURCE,
          node: nodeById.get(isTarget ? edge.source : edge.target),
        };
      });
  }, [graph, fragmentId]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col gap-2 px-4 pt-4">
        {kind && (
          <span className="self-start rounded-full border border-border-subtle bg-surface-inset px-2 py-0.5 text-3xs uppercase tracking-wider text-text-muted">
            {KIND_LABEL[kind]}
          </span>
        )}
        <h2 className="text-sm font-medium text-text-base wrap-break-word">Relationships · {cue}</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto m-4 flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="text-xs text-text-muted">This fragment has no direct relationships.</p>
        ) : (
          rows.map((row) => <FragmentRelationshipRowItem key={row.relationshipId} row={row} />)
        )}
      </div>

      <div className="flex items-center justify-end px-3 py-2 bg-surface-elevated">
        <ActionButton label="Close" onClick={onClose} />
      </div>
    </div>
  );
}
