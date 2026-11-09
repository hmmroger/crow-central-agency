import { useCallback, useState } from "react";
import { FEED_NOTIFICATION_SESSION_TEXT, SessionNameInput } from "../common/session-name-input.js";

interface SuperCrowFeedSessionFieldProps {
  /** Saved value; remount the field (via key) when it changes to reset the draft */
  savedName: string | undefined;
  onSave: (name: string | null) => void;
  disabled: boolean;
}

/** Crow's feed notification session, saved when the field loses focus. */
export function SuperCrowFeedSessionField({ savedName, onSave, disabled }: SuperCrowFeedSessionFieldProps) {
  const [draft, setDraft] = useState(savedName ?? "");

  const handleBlur = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === (savedName ?? "")) {
      return;
    }

    onSave(trimmed || null);
  }, [draft, savedName, onSave]);

  return (
    <SessionNameInput
      label={FEED_NOTIFICATION_SESSION_TEXT.label}
      helpText={FEED_NOTIFICATION_SESSION_TEXT.helpText}
      value={draft}
      onChange={setDraft}
      onBlur={handleBlur}
      disabled={disabled}
    />
  );
}
