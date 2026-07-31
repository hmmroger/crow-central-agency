import { useCallback } from "react";
import { Waypoints } from "lucide-react";
import type { FragmentKind } from "@crow-central-agency/shared";
import { useFragmentQuery } from "../../hooks/queries/use-fragment-query.js";
import { formatRelativeTime } from "../../utils/format-utils.js";
import { MarkdownRenderer } from "../common/markdown-renderer.js";
import { CopyButton } from "../common/copy-button.js";
import { ActionButton } from "../common/action-button.js";
import { KIND_LABEL } from "./fragment-kind-label.js";
import { useOpenFragmentRelationships } from "./use-open-fragment-relationships.js";

interface FragmentViewerDialogProps {
  fragmentId: string;
  /** Cue from the known graph node, so the header paints while the body loads */
  cue: string;
  kind?: FragmentKind;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Read-only modal for viewing a fragment's full body and metadata.
 * The kind badge and cue paint immediately from the graph node; the body,
 * usage count, and timestamps stream in via useFragmentQuery.
 */
export function FragmentViewerDialog({ fragmentId, cue, kind, onClose }: FragmentViewerDialogProps) {
  const { data: fragment, isLoading, isError } = useFragmentQuery(fragmentId);
  const openRelationships = useOpenFragmentRelationships();

  const handleOpenRelationships = useCallback(
    () => openRelationships(fragmentId, cue, kind),
    [openRelationships, fragmentId, cue, kind]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Custom header: kind badge + cue */}
      <div className="flex flex-col gap-2 px-4 pt-4">
        {kind && (
          <span className="self-start rounded-full border border-border-subtle bg-surface-inset px-2 py-0.5 text-3xs uppercase tracking-wider text-text-muted">
            {KIND_LABEL[kind]}
          </span>
        )}
        <h2 className="text-sm font-medium text-text-base wrap-break-word">{cue}</h2>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto m-4 p-3 rounded-md bg-surface-inset border border-border-subtle">
        {isLoading && <p className="text-xs text-text-muted">Loading fragment…</p>}
        {isError && <p className="text-xs text-error">This fragment could not be loaded.</p>}
        {fragment && <MarkdownRenderer content={fragment.body} />}
      </div>

      {/* Metadata */}
      {fragment && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-3xs uppercase tracking-wider text-text-muted">
          <span>Recalled {fragment.usageCount}×</span>
          {fragment.lastRecalledTimestamp !== undefined && (
            <span>Last recall {formatRelativeTime(fragment.lastRecalledTimestamp)}</span>
          )}
          <span>Created {formatRelativeTime(fragment.createdTimestamp)}</span>
          <span>Updated {formatRelativeTime(fragment.updatedTimestamp)}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-elevated">
        {fragment ? <CopyButton text={fragment.body} /> : <span />}
        <div className="flex items-center gap-2">
          <ActionButton icon={Waypoints} label="Relationships" onClick={handleOpenRelationships} />
          <ActionButton label="Close" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
