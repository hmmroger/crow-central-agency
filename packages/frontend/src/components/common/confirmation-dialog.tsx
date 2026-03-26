/**
 * Reusable confirmation dialog content for the modal dialog framework.
 * Rendered inside ModalDialogRenderer — onClose is injected automatically.
 */

interface ConfirmationDialogProps {
  /** Body text explaining what will happen */
  message: string;
  /** Label for the confirm button (default: "Confirm") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** When true, styles the confirm button as destructive */
  destructive?: boolean;
  /** Called when the user confirms */
  onConfirm: () => void;
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
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const confirmClass = destructive
    ? "bg-error/15 text-error border border-error/25 hover:bg-error/25"
    : "bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25";

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
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${confirmClass}`}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
