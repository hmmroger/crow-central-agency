import { useCallback } from "react";
import type { FragmentKind } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { FragmentRelationshipsDialog } from "./fragment-relationships-dialog.js";

const FRAGMENT_RELATIONSHIPS_DIALOG_ID = "fragment-relationships";

/**
 * Hook to open the relationships dialog for a fragment, stacked on top of the
 * viewer. Cue and kind come from the already-known graph node.
 */
export function useOpenFragmentRelationships() {
  const { showDialog } = useModalDialog();
  return useCallback(
    (fragmentId: string, cue: string, kind?: FragmentKind) => {
      showDialog({
        id: `${FRAGMENT_RELATIONSHIPS_DIALOG_ID}-${fragmentId}`,
        component: FragmentRelationshipsDialog,
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
