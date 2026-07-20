import { useCallback } from "react";
import type { FragmentKind } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { FragmentViewerDialog } from "./fragment-viewer-dialog.js";

const FRAGMENT_VIEWER_DIALOG_ID = "fragment-viewer";

/**
 * Hook to open a fragment in a read-only modal viewer. Cue and kind come from
 * the already-known graph node so the header paints before the body loads.
 */
export function useOpenFragmentViewer() {
  const { showDialog } = useModalDialog();
  return useCallback(
    (fragmentId: string, cue: string, kind?: FragmentKind) => {
      showDialog({
        id: `${FRAGMENT_VIEWER_DIALOG_ID}-${fragmentId}`,
        component: FragmentViewerDialog,
        componentProps: {
          fragmentId,
          cue,
          kind,
        },
        className: "w-full max-w-2xl max-h-(--max-height-editor-dialog) flex flex-col",
      });
    },
    [showDialog]
  );
}
