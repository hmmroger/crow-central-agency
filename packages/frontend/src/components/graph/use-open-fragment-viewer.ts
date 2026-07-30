import { useCallback } from "react";
import type { FragmentKind } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { FragmentViewerDialog } from "./fragment-viewer-dialog.js";

const FRAGMENT_VIEWER_DIALOG_ID = "fragment-viewer";

/** Stable dialog id for a fragment viewer, so callers can dismiss a specific viewer by id */
export function fragmentViewerDialogId(fragmentId: string): string {
  return `${FRAGMENT_VIEWER_DIALOG_ID}-${fragmentId}`;
}

/**
 * Hook to open a fragment in a read-only modal viewer. Cue and kind come from
 * the already-known graph node so the header paints before the body loads.
 */
export function useOpenFragmentViewer() {
  const { showDialog } = useModalDialog();
  return useCallback(
    (fragmentId: string, cue: string, kind?: FragmentKind) => {
      showDialog({
        id: fragmentViewerDialogId(fragmentId),
        component: FragmentViewerDialog,
        componentProps: {
          fragmentId,
          cue,
          kind,
        },
        className: "w-(--width-editor-dialog) max-w-2xl max-h-(--max-height-editor-dialog) flex flex-col",
      });
    },
    [showDialog]
  );
}
