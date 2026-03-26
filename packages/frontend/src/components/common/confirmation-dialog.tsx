/**
 * Reusable confirmation dialog content for the modal dialog framework.
 * Rendered inside ModalDialogRenderer — onClose is injected automatically.
 * Supports async onConfirm — dialog stays open until the callback resolves.
 */

import { useState } from "react";
import { cn } from "../../utils/cn.js";

interface ConfirmationDialogProps {
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
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

export function ConfirmationDialog({
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmationDialogProps) {
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = async () => {
    setIsPending(true);

    try {
      await onConfirm();
      onClose();
    } catch {
      // Error handling is the caller's responsibility — just re-enable the button
      setIsPending(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <p id="confirmation-dialog-desc" className="text-sm text-text-secondary">
        {message}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded-md text-sm text-text-muted border border-border-subtle hover:text-text-secondary transition-colors"
          onClick={onClose}
          disabled={isPending}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-40",
            destructive
              ? "bg-error/15 text-error border border-error/25 hover:bg-error/25"
              : "bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25"
          )}
          onClick={() => void handleConfirm()}
          disabled={isPending}
        >
          {isPending ? "..." : confirmLabel}
        </button>
      </div>
    </div>
  );
}
