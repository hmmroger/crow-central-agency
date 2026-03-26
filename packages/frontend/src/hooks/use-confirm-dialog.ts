import { useCallback } from "react";
import { useModalDialog } from "../providers/modal-dialog-provider.js";
import { ConfirmationDialog } from "../components/common/confirmation-dialog.js";

const CONFIRM_DIALOG_ID = "confirmation";

interface ConfirmDialogOptions {
  /** Dialog header title */
  title: string;
  /** Body text explaining what will happen */
  message: string;
  /** Label for the confirm button (default: "Confirm") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** When true, styles the confirm button as destructive */
  destructive?: boolean;
  /** Called when the user confirms — if async, dialog stays open until resolved */
  onConfirm: () => void | Promise<void>;
  /** Called when the dialog is dismissed without confirming (Escape, backdrop, Cancel button) */
  onClose?: () => void;
}

/**
 * Returns a function that shows a confirmation dialog via the modal dialog framework.
 * Wraps useModalDialog + ConfirmationDialog for ergonomic one-liner usage.
 *
 * @example
 * const confirm = useConfirmDialog();
 * confirm({ title: "Delete?", message: "This cannot be undone.", onConfirm: handleDelete, destructive: true });
 */
export function useConfirmDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(
    (options: ConfirmDialogOptions) => {
      showDialog({
        id: CONFIRM_DIALOG_ID,
        title: options.title,
        component: ConfirmationDialog,
        componentProps: {
          message: options.message,
          confirmLabel: options.confirmLabel,
          cancelLabel: options.cancelLabel,
          destructive: options.destructive,
          onConfirm: options.onConfirm,
        },
        onClose: options.onClose,
        role: "alertdialog",
        ariaDescribedBy: "confirmation-dialog-desc",
        className: "w-96",
      });
    },
    [showDialog]
  );
}
