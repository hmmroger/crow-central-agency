import { ENTITY_TYPE, RELATIONSHIP_DIRECTION, type RelationshipDirection } from "@crow-central-agency/shared";
import { KIND_LABEL } from "./fragment-kind-label.js";
import type { FragmentRelationshipRow } from "./fragment-relationships-dialog.types.js";

interface FragmentRelationshipRowItemProps {
  row: FragmentRelationshipRow;
}

/** Counterpart of the open fragment's role: a TARGET edge's counterpart is the parent, a SOURCE edge's is the child */
const DIRECTION_LABEL: Record<RelationshipDirection, string> = {
  [RELATIONSHIP_DIRECTION.TARGET]: "Parent",
  [RELATIONSHIP_DIRECTION.SOURCE]: "Child",
};

/** Shown when the counterpart is a background agent, which the graph omits from its node list */
const UNRESOLVED_COUNTERPART_LABEL = "Background agent";

/** One direct edge of the open fragment: counterpart label with an optional kind badge, and its role. */
export function FragmentRelationshipRowItem({ row }: FragmentRelationshipRowItemProps) {
  const { node } = row;
  const isFragment = node?.entityType === ENTITY_TYPE.FRAGMENT;
  const label = node?.name ?? UNRESOLVED_COUNTERPART_LABEL;

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-inset px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {isFragment && node.kind && (
          <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-3xs uppercase tracking-wider text-text-muted">
            {KIND_LABEL[node.kind]}
          </span>
        )}
        <span className="truncate text-xs text-text-base">{label}</span>
      </div>
      <span className="shrink-0 text-3xs uppercase tracking-wider text-text-muted">
        {DIRECTION_LABEL[row.direction]}
      </span>
    </div>
  );
}
