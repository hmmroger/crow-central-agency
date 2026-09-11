import type { ConfiguredFeed } from "@crow-central-agency/shared";
import { FeedMultiSelect } from "../common/feed-multi-select.js";
import { FieldGroup } from "./field-group.js";

interface FeedsSectionProps {
  configuredFeeds: ConfiguredFeed[];
  onToggle: (feedId: string) => void;
  onToggleNotify: (feedId: string) => void;
}

/**
 * Feed selection section in the agent editor.
 * Thin wrapper around FeedMultiSelect that provides the editor-specific FieldGroup framing.
 */
export function FeedsSection({ configuredFeeds, onToggle, onToggleNotify }: FeedsSectionProps) {
  return (
    <FieldGroup label="Feeds">
      <FeedMultiSelect
        configuredFeeds={configuredFeeds}
        onToggle={onToggle}
        onToggleNotify={onToggleNotify}
        helperText="Feeds the agent can read from. Toggle the bell on a selected feed to be notified when new items arrive."
      />
    </FieldGroup>
  );
}
