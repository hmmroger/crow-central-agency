import { useCallback } from "react";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { useModalDialog } from "../../../providers/modal-dialog-provider.js";
import { ArtifactViewerDialog } from "./artifact-viewer-dialog.js";

const ARTIFACT_VIEWER_DIALOG_ID = "artifact-viewer";

/**
 * Hook to open an artifact in a modal dialog for a larger viewing window.
 */
export function useOpenArtifactViewer() {
  const { showDialog } = useModalDialog();
  return useCallback(
    (artifact: ArtifactMetadata) => {
      showDialog({
        id: `${ARTIFACT_VIEWER_DIALOG_ID}-${artifact.entityId}-${artifact.filename}`,
        component: ArtifactViewerDialog,
        componentProps: {
          entityType: artifact.entityType,
          entityId: artifact.entityId,
          filename: artifact.filename,
        },
        title: artifact.filename,
        className: "w-(--width-editor-dialog) max-w-5xl max-h-(--max-height-editor-dialog) flex flex-col",
      });
    },
    [showDialog]
  );
}
