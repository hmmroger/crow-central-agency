import { CircleDot, FileText, Maximize2, Tag, Trash2 } from "lucide-react";
import { AGENT_TASK_SOURCE_TYPE, ENTITY_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { formatRelativeTime, formatSize } from "../../../utils/format-utils.js";

interface ArtifactItemProps {
  artifact: ArtifactMetadata;
  onClick: () => void;
  onExpand?: (artifact: ArtifactMetadata) => void;
  onDelete?: (artifact: ArtifactMetadata) => void;
}

/**
 * Single artifact list item with icon, filename, size, and timestamp.
 * Shows an expand button to open the viewer in a larger dialog, and a
 * delete button for artifacts the user owns or that have no agent author
 * (created by the user directly or attributed to SYSTEM).
 */
export function ArtifactItem({ artifact, onClick, onExpand, onDelete }: ArtifactItemProps) {
  const { sourceType } = artifact.createdBy;
  const canDelete = sourceType === AGENT_TASK_SOURCE_TYPE.USER || sourceType === AGENT_TASK_SOURCE_TYPE.SYSTEM;

  const tags = artifact.tags ?? [];
  const tagCount = tags.length;

  return (
    <div className="group flex items-center hover:bg-surface-elevated transition-colors">
      <button type="button" className="flex-1 flex items-center gap-2 px-3 py-1.5 text-left min-w-0" onClick={onClick}>
        {artifact.entityType === ENTITY_TYPE.AGENT_CIRCLE ? (
          <CircleDot className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-neutral truncate">{artifact.filename}</div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="truncate">
              {formatSize(artifact.size)} &middot; {formatRelativeTime(artifact.updatedTimestamp)}
            </span>
            {tagCount > 0 && (
              <span
                className="ml-auto flex items-center gap-0.5 shrink-0 text-text-muted"
                title={`Tags: ${tags.join(", ")}`}
              >
                <Tag className="h-3 w-3" />
                <span className="text-2xs tabular-nums">{tagCount}</span>
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="flex items-center pr-2">
        {/* Expand action — opens the artifact in a larger dialog */}
        {onExpand && (
          <button
            type="button"
            className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-base hover:bg-surface-elevated transition-all"
            onClick={() => onExpand(artifact)}
            title="Open in larger view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Delete action for user-owned or system-attributed artifacts */}
        {canDelete && onDelete && (
          <button
            type="button"
            className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-error transition-all"
            onClick={() => onDelete(artifact)}
            title="Delete artifact"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
