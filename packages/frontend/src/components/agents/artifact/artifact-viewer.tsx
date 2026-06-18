import { ArrowLeft } from "lucide-react";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { ArtifactContentRenderer } from "./artifact-content-renderer.js";
import { ArtifactTagList } from "./artifact-tag-list.js";
import { ArtifactTagEditor } from "./artifact-tag-editor.js";
import { canUserModifyArtifact } from "./artifact-permissions.js";

/** Tags shown before collapsing in the narrow inline viewer */
const VISIBLE_TAG_LIMIT = 6;

interface ArtifactViewerProps {
  artifact: ArtifactMetadata;
  availableTags: string[];
  onUpdated: () => void;
  onClose: () => void;
}

/**
 * View artifact file content in a slide-over panel.
 * Renders text, markdown, images, or a not-supported message based on content type.
 * Owned artifacts get an editable tag control in the header; others show read-only tags.
 */
export function ArtifactViewer({ artifact, availableTags, onUpdated, onClose }: ArtifactViewerProps) {
  const { entityType, entityId, filename, tags } = artifact;
  const canModify = canUserModifyArtifact(artifact);

  return (
    <div className="flex flex-col h-full border-l border-border-subtle bg-surface">
      {/* Header */}
      <div className="flex items-start gap-2 px-3 py-2 border-b border-border-subtle">
        <button
          type="button"
          className="shrink-0 p-1 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors"
          onClick={onClose}
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1 pt-0.5">
          <span className="text-sm font-mono text-text-neutral truncate">{filename}</span>
          {canModify ? (
            <ArtifactTagEditor artifact={artifact} availableTags={availableTags} onUpdated={onUpdated} />
          ) : (
            tags && tags.length > 0 && <ArtifactTagList tags={tags} maxVisible={VISIBLE_TAG_LIMIT} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        <ArtifactContentRenderer entityType={entityType} entityId={entityId} filename={filename} />
      </div>
    </div>
  );
}
