import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { ENTITY_TYPE, RELATIONSHIP_DIRECTION, type RelationshipDirection } from "@crow-central-agency/shared";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { KIND_LABEL } from "./fragment-kind-label.js";
import type { FragmentRelationshipRow } from "./fragment-relationships-dialog.types.js";

interface FragmentRelationshipRowItemProps {
  row: FragmentRelationshipRow;
  onRemove: (row: FragmentRelationshipRow) => void;
  disabled?: boolean;
}

/** Counterpart of the open fragment's role: a TARGET edge's counterpart is the parent, a SOURCE edge's is the child */
const DIRECTION_LABEL: Record<RelationshipDirection, string> = {
  [RELATIONSHIP_DIRECTION.TARGET]: "Parent",
  [RELATIONSHIP_DIRECTION.SOURCE]: "Child",
};

/** One direct edge of the open fragment: counterpart label with an optional kind badge, and its role. */
export function FragmentRelationshipRowItem({ row, onRemove, disabled = false }: FragmentRelationshipRowItemProps) {
  const { node } = row;
  const isFragment = node.entityType === ENTITY_TYPE.FRAGMENT;
  const label = node.name;

  const handleRemove = useCallback(() => onRemove(row), [onRemove, row]);

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-inset px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {isFragment && node.kind && (
          <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-3xs uppercase tracking-wider text-text-muted">
            {KIND_LABEL[node.kind]}
          </span>
        )}
        <span className="truncate text-xs text-text-base">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-3xs uppercase tracking-wider text-text-muted">{DIRECTION_LABEL[row.direction]}</span>
        <ActionButton
          icon={Trash2}
          label="Remove relationship"
          iconOnly
          variant={ACTION_BUTTON_VARIANT.DESTRUCTIVE}
          disabled={disabled}
          onClick={handleRemove}
          className="w-6 h-6"
        />
      </div>
    </div>
  );
}
