import { useCallback, useMemo } from "react";
import { RELATIONSHIP_DIRECTION, type FragmentKind } from "@crow-central-agency/shared";
import { useGraphQuery } from "../../hooks/queries/use-graph-query.js";
import { useDeleteRelationship } from "../../hooks/queries/use-relationship-mutations.js";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { ActionButton } from "../common/action-button.js";
import { KIND_LABEL } from "./fragment-kind-label.js";
import { FragmentRelationshipRowItem } from "./fragment-relationship-row.js";
import { FragmentRelationshipAdd } from "./fragment-relationship-add.js";
import { fragmentViewerDialogId } from "./use-open-fragment-viewer.js";
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
 * (parent or child of this fragment). Removing the fragment's last parent
 * cascades: it deletes the fragment itself, so the viewer beneath is dismissed too.
 */
export function FragmentRelationshipsDialog({ fragmentId, cue, kind, onClose }: FragmentRelationshipsDialogProps) {
  const { data: graph } = useGraphQuery();
  const deleteRelationship = useDeleteRelationship();
  const { hideDialog } = useModalDialog();
  const confirm = useConfirmDialog();

  const rows = useMemo<FragmentRelationshipRow[]>(() => {
    if (!graph) {
      return [];
    }

    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    return graph.edges
      .filter((edge) => edge.target === fragmentId)
      .map((edge) => {
        const node = nodeById.get(edge.source);
        return node
          ? {
              relationshipId: edge.id,
              direction: RELATIONSHIP_DIRECTION.TARGET,
              node,
            }
          : undefined;
      })
      .filter((row) => !!row);
  }, [graph, fragmentId]);

  const parentRowCount = useMemo(
    () => rows.filter((row) => row.direction === RELATIONSHIP_DIRECTION.TARGET).length,
    [rows]
  );

  const performRemove = useCallback(
    async (relationshipId: string) => {
      try {
        const result = await deleteRelationship.mutateAsync(relationshipId);
        // The cascade can delete the open fragment; decide from the response, not a pre-flight guess
        if (result.collectedFragmentIds.includes(fragmentId)) {
          onClose();
          hideDialog(fragmentViewerDialogId(fragmentId));
        }
      } catch {
        // Failure is surfaced via deleteRelationship.error; the dialog stays open
      }
    },
    [deleteRelationship, fragmentId, onClose, hideDialog]
  );

  const handleRemove = useCallback(
    (row: FragmentRelationshipRow) => {
      const isLastParent = row.direction === RELATIONSHIP_DIRECTION.TARGET && parentRowCount === 1;
      const title = isLastParent ? "Remove last parent?" : "Remove parent";
      const message = isLastParent
        ? `This is the only relationship keeping [${cue}] reachable. Removing it permanently deletes this memory and any children left with no other parent.`
        : `Remove relationship between [${cue}] and [${row.node.name}]?`;

      confirm({
        title,
        message,
        confirmLabel: "Remove and delete",
        destructive: true,
        onConfirm: () => performRemove(row.relationshipId),
      });
    },
    [confirm, cue, parentRowCount, performRemove]
  );

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
          <p className="text-xs text-text-muted">This fragment has no parent.</p>
        ) : (
          rows.map((row) => (
            <FragmentRelationshipRowItem
              key={row.relationshipId}
              row={row}
              onRemove={handleRemove}
              disabled={deleteRelationship.isPending}
            />
          ))
        )}
      </div>

      <FragmentRelationshipAdd fragmentId={fragmentId} kind={kind} />

      {deleteRelationship.error && <p className="px-4 pb-2 text-xs text-error">{deleteRelationship.error.message}</p>}

      <div className="flex items-center justify-end px-3 py-2 bg-surface-elevated">
        <ActionButton label="Close" onClick={onClose} />
      </div>
    </div>
  );
}
