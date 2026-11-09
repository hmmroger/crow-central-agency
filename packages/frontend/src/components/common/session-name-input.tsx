import { useId } from "react";
import { SESSION_LABEL_MAX_LENGTH } from "@crow-central-agency/shared";

interface SessionNameInputProps {
  label: string;
  helpText: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
}

/** Wording shared by the agent editor and Crow's settings for an agent's feed notification session */
export const FEED_NOTIFICATION_SESSION_TEXT = {
  label: "Notification Session",
  helpText:
    "Feed notifications run in the session with this name, created if missing, without changing the active session. Leave blank to use the active session.",
} as const;

/** Name of the session some background work runs in. Blank keeps it in the active session. */
export function SessionNameInput({ label, helpText, value, onChange, onBlur, disabled }: SessionNameInputProps) {
  const inputId = useId();

  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-medium text-text-neutral mb-1.5">
        {label}
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
      <p className="mt-1 text-xs text-text-muted">{helpText}</p>
    </div>
  );
}
