import { useId } from "react";
import { SESSION_LABEL_MAX_LENGTH } from "@crow-central-agency/shared";

interface FeedNotificationSessionInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
}

/** Session name that an agent's feed notifications run in. Blank keeps them in the active session. */
export function FeedNotificationSessionInput({ value, onChange, onBlur, disabled }: FeedNotificationSessionInputProps) {
  const inputId = useId();

  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-medium text-text-neutral mb-1.5">
        Notification Session
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        maxLength={SESSION_LABEL_MAX_LENGTH}
        placeholder="Active session"
        className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
      />
      <p className="mt-1 text-xs text-text-muted">
        Feed notifications run in the session with this name, created if missing, without changing the active session.
        Leave blank to use the active session.
      </p>
    </div>
  );
}
