import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { EditorLinkDialog } from "../../components/notes/editor-link-dialog.js";
import type { EditorLinkDialogOptions } from "../../components/notes/editor-link-dialog.types.js";

const EDITOR_LINK_DIALOG_ID = "editor-link";

/**
 * Hook to open the editor's link dialog.
 *
 * @returns A function that opens the dialog to edit the given link, or to add one when there is none.
 */
export function useOpenEditorLinkDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(
    (options: EditorLinkDialogOptions) => {
      showDialog({
        id: EDITOR_LINK_DIALOG_ID,
        title: options.link ? "Edit link" : "Add link",
        component: EditorLinkDialog,
        componentProps: options,
        className: "w-96",
      });
    },
    [showDialog]
  );
}
