import { useCallback, useState } from "react";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../action-button.js";

interface ConfirmationDialogProps {
  /** Body text explaining what will happen */
  message: string;
  /** Label for the confirm button (default: "Confirm") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** When true, styles the confirm button as destructive */
  destructive?: boolean;
  /** Called when the user confirms - if async, dialog stays open until resolved */
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
  const [error, setError] = useState<string | undefined>(undefined);

  const handleConfirm = useCallback(async () => {
    setIsPending(true);
    setError(undefined);

    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsPending(false);
    }
  }, [onConfirm, onClose]);

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-3">
        <p id="confirmation-dialog-desc" className="text-sm text-text-neutral">
          {message}
        </p>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label={cancelLabel} onClick={onClose} disabled={isPending} />
        <ActionButton
          label={isPending ? "..." : confirmLabel}
          variant={destructive ? ACTION_BUTTON_VARIANT.DESTRUCTIVE : ACTION_BUTTON_VARIANT.PRIMARY}
          onClick={handleConfirm}
          disabled={isPending}
        />
      </div>
    </div>
  );
}
