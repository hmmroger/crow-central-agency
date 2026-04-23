import { useCallback } from "react";
import type { AgentCircle } from "@crow-central-agency/shared";
import { useModalDialog } from "../../../providers/modal-dialog-provider.js";
import { CircleEditorDialog } from "./circle-editor-dialog.js";

const CIRCLE_EDITOR_DIALOG_ID = "circle-editor";

/**
 * Hook to open the circle editor as a modal dialog.
 *
 * @returns A function that opens the editor — pass a circle to edit, omit to create new.
 */
export function useOpenCircleEditor() {
  const { showDialog } = useModalDialog();

  return useCallback(
    (circle?: AgentCircle) => {
      const dialogId = circle ? `${CIRCLE_EDITOR_DIALOG_ID}-${circle.id}` : `${CIRCLE_EDITOR_DIALOG_ID}-new`;
      showDialog({
        id: dialogId,
        component: CircleEditorDialog,
        componentProps: circle ? { circle } : {},
        title: circle ? "Edit Circle" : "New Circle",
        className: "w-fit",
        listNavigation: true,
      });
    },
    [showDialog]
  );
}
