import type { EntityType } from "@crow-central-agency/shared";
import { ArtifactContentRenderer } from "./artifact-content-renderer.js";
import { ArtifactTagList } from "./artifact-tag-list.js";
import { useArtifactContentQuery } from "../../../hooks/queries/use-artifact-content-query.js";
import { ActionButton } from "../../common/action-button.js";
import { CopyButton } from "../../common/copy-button.js";

/** Tags shown before collapsing in the wider dialog viewer */
const VISIBLE_TAG_LIMIT = 12;

interface ArtifactViewerDialogProps {
  entityType: EntityType;
  entityId: string;
  filename: string;
  tags?: string[];
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Modal content for viewing an artifact in a larger window.
 * Designed to be used with `showDialog()` from the modal dialog provider.
 */
export function ArtifactViewerDialog({ entityType, entityId, filename, tags, onClose }: ArtifactViewerDialogProps) {
  const { data } = useArtifactContentQuery(entityType, entityId, filename);
  const textContent = data?.type === "text" ? data.content : undefined;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tags strip */}
      {tags && tags.length > 0 && <ArtifactTagList tags={tags} maxVisible={VISIBLE_TAG_LIMIT} className="px-3 pt-3" />}

      {/* Content area with inset background */}
      <div className="flex-1 overflow-y-auto m-3 p-3 rounded-md bg-surface-inset border border-border-subtle">
        <ArtifactContentRenderer entityType={entityType} entityId={entityId} filename={filename} />
      </div>

      {/* Footer with optional copy + close */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-elevated">
        {textContent !== undefined ? <CopyButton text={textContent} /> : <span />}
        <ActionButton label="Close" onClick={onClose} />
      </div>
    </div>
  );
}
