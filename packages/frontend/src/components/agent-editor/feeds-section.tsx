import type { ConfiguredFeed } from "@crow-central-agency/shared";
import { FeedMultiSelect } from "../common/feed-multi-select.js";
import { FEED_NOTIFICATION_SESSION_TEXT, SessionNameInput } from "../common/session-name-input.js";
import { FieldGroup } from "./field-group.js";

interface FeedsSectionProps {
  configuredFeeds: ConfiguredFeed[];
  notificationSessionName: string;
  onToggle: (feedId: string) => void;
  onToggleNotify: (feedId: string) => void;
  onNotificationSessionNameChange: (value: string) => void;
}

/**
 * Feed selection section in the agent editor.
 * Thin wrapper around FeedMultiSelect that provides the editor-specific FieldGroup framing.
 */
export function FeedsSection({
  configuredFeeds,
  notificationSessionName,
  onToggle,
  onToggleNotify,
  onNotificationSessionNameChange,
}: FeedsSectionProps) {
  return (
    <FieldGroup label="Feeds">
      <div className="space-y-3">
        <SessionNameInput
          label={FEED_NOTIFICATION_SESSION_TEXT.label}
          helpText={FEED_NOTIFICATION_SESSION_TEXT.helpText}
          value={notificationSessionName}
          onChange={onNotificationSessionNameChange}
        />
        <FeedMultiSelect
          configuredFeeds={configuredFeeds}
          onToggle={onToggle}
          onToggleNotify={onToggleNotify}
          helperText="Feeds the agent can read from. Toggle the bell on a selected feed to be notified when new items arrive."
        />
      </div>
    </FieldGroup>
  );
}
