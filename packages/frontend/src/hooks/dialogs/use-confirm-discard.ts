import { useCallback } from "react";
import { useConfirmDialog } from "./use-confirm-dialog.js";

/**
 * Returns a function that resolves to true if the form is clean or the user
 * confirms discarding unsaved changes.
 */
export function useConfirmDiscard(isDirty: boolean): () => Promise<boolean> {
  const confirm = useConfirmDialog();

  return useCallback(() => {
    if (!isDirty) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      confirm({
        title: "Discard Changes",
        message: "You have unsaved changes. Are you sure you want to discard them?",
        confirmLabel: "Discard",
        destructive: true,
        onConfirm: () => resolve(true),
        onClose: () => resolve(false),
      });
    });
  }, [isDirty, confirm]);
}
