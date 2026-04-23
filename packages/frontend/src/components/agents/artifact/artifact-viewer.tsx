import { X } from "lucide-react";
import type { EntityType } from "@crow-central-agency/shared";
import { ArtifactContentRenderer } from "./artifact-content-renderer.js";

interface ArtifactViewerProps {
  entityType: EntityType;
  entityId: string;
  filename: string;
  onClose: () => void;
}

/**
 * View artifact file content in a slide-over panel.
 * Renders text, markdown, images, or a not-supported message based on content type.
 */
export function ArtifactViewer({ entityType, entityId, filename, onClose }: ArtifactViewerProps) {
  return (
    <div className="flex flex-col h-full border-l border-border-subtle bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-sm font-mono text-text-neutral truncate">{filename}</span>
        <button
          type="button"
          className="p-1 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        <ArtifactContentRenderer entityType={entityType} entityId={entityId} filename={filename} />
      </div>
    </div>
  );
}
