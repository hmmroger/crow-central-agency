import { useCallback, useState, type ChangeEvent, type SubmitEvent } from "react";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../action-button.js";

interface PromptDialogProps {
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
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

export function PromptDialog({
  message,
  label,
  placeholder,
  initialValue = "",
  maxLength,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !isPending;

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  }, []);

  const handleSubmit = useCallback(
    async (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }

      setIsPending(true);
      setError(undefined);

      try {
        await onConfirm(trimmed);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setIsPending(false);
      }
    },
    [onConfirm, onClose, trimmed, canSubmit]
  );

  return (
    <form className="flex flex-col" onSubmit={handleSubmit}>
      <div className="p-3 space-y-3">
        {message && (
          <p id="prompt-dialog-desc" className="text-sm text-text-neutral">
            {message}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          {label && <label className="text-xs font-medium text-text-neutral">{label}</label>}
          <input
            type="text"
            autoFocus
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={isPending}
            className="w-full px-3 py-1.5 rounded-md bg-surface-elevated border border-border-subtle text-sm text-text-base placeholder:text-text-muted focus:outline-none focus:border-primary/50"
          />
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label={cancelLabel} onClick={onClose} disabled={isPending} />
        <ActionButton
          label={isPending ? "..." : confirmLabel}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          type="submit"
          disabled={!canSubmit}
        />
      </div>
    </form>
  );
}
