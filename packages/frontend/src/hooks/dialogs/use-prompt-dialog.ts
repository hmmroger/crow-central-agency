import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { PromptDialog } from "../../components/common/dialogs/prompt-dialog.js";

const PROMPT_DIALOG_ID = "prompt";

interface PromptDialogOptions {
  /** Dialog header title */
  title: string;
  /** Optional body text rendered above the input */
  message?: string;
  /** Field label rendered above the input */
  label?: string;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Initial value for the input */
  initialValue?: string;
  /** Maximum length enforced on the input */
  maxLength?: number;
  /** Label for the confirm button (default: "Save") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** Called with the trimmed value when the user confirms */
  onConfirm: (value: string) => void | Promise<void>;
  /** Called when the dialog is dismissed without confirming */
  onClose?: () => void;
}

/**
 * Returns a function that shows a prompt dialog via the modal dialog framework.
 * Wraps useModalDialog + PromptDialog for ergonomic one-liner usage.
 *
 * @example
 * const prompt = usePromptDialog();
 * prompt({ title: "Save as Template", label: "Template name", onConfirm: handleSave });
 */
export function usePromptDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(
    (options: PromptDialogOptions) => {
      showDialog({
        id: PROMPT_DIALOG_ID,
        title: options.title,
        component: PromptDialog,
        componentProps: {
          message: options.message,
          label: options.label,
          placeholder: options.placeholder,
          initialValue: options.initialValue,
          maxLength: options.maxLength,
          confirmLabel: options.confirmLabel,
          cancelLabel: options.cancelLabel,
          onConfirm: options.onConfirm,
        },
        onClose: options.onClose,
        role: "dialog",
        ariaDescribedBy: options.message ? "prompt-dialog-desc" : undefined,
        className: "w-96",
      });
    },
    [showDialog]
  );
}
