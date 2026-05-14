import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface GmailNotificationSectionProps {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
}

export function GmailNotificationSection({ enabled, onEnabledChange }: GmailNotificationSectionProps) {
  return (
    <FieldGroup label="Gmail Notification">
      <p className="mb-1.5 text-xs text-text-muted">Periodically check Gmail for new messages and notify the agent.</p>
      <Toggle checked={enabled} onChange={onEnabledChange} label="Notify on new mail" />
      <p className="mt-1 text-3xs text-text-muted">Takes effect only when the Gmail MCP server is also enabled.</p>
    </FieldGroup>
  );
}
