import { useCallback, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from "react";
import { cn } from "../../utils/cn.js";
import { getErrorMessage } from "../../utils/error-message.js";

interface InlineTextEditProps {
  value: string;
  /** Called with the trimmed new value on Enter; a rejection keeps the field open with the error shown */
  onSubmit: (value: string) => Promise<void>;
  /** Names the field and the button that opens it */
  label: string;
  maxLength?: number;
  /** Shows the value as plain text that cannot be edited */
  disabled?: boolean;
  /** Text styling shared by the shown value and the field, so opening it does not shift the layout */
  className?: string;
}

/**
 * Text that turns into a field when clicked. Enter submits, Escape or leaving the field
 * discards; an empty or unchanged value closes it without submitting.
 */
export function InlineTextEdit({
  value,
  onSubmit,
  label,
  maxLength,
  disabled = false,
  className,
}: InlineTextEditProps) {
  const [draft, setDraft] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string>();

  const close = useCallback(() => {
    setDraft(undefined);
    setError(undefined);
  }, []);

  const handleOpen = useCallback(() => {
    setDraft(value);
  }, [value]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    setError(undefined);
  }, []);

  const handleFocus = useCallback((event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
  }, []);

  const submit = useCallback(async () => {
    const trimmed = draft?.trim();

    if (!trimmed || trimmed === value) {
      close();

      return;
    }

    setIsPending(true);

    try {
      await onSubmit(trimmed);
      close();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsPending(false);
    }
  }, [draft, value, onSubmit, close]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (isPending) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    },
    [isPending, submit, close]
  );

  if (disabled) {
    return <span className={cn("block truncate", className)}>{value}</span>;
  }

  if (draft === undefined) {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={handleOpen}
        className={cn(
          "block max-w-full truncate rounded-md border border-transparent px-1 text-left hover:bg-surface-elevated",
          className
        )}
      >
        {value}
      </button>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onBlur={isPending ? undefined : close}
        maxLength={maxLength}
        readOnly={isPending}
        aria-label={label}
        aria-invalid={error !== undefined}
        className={cn(
          "w-full min-w-0 rounded-md border border-border-subtle bg-surface-elevated px-1 focus:outline-none focus:border-primary/50",
          className
        )}
      />
      {error && <p className="text-2xs text-error">{error}</p>}
    </div>
  );
}
