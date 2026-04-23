import type { ConfiguredFeed } from "@crow-central-agency/shared";
import { FeedMultiSelect, useSelectedFeedCountLabel } from "../common/feed-multi-select.js";
import { FieldGroup } from "./field-group.js";

interface FeedsSectionProps {
  configuredFeeds: ConfiguredFeed[];
  onToggle: (feedId: string) => void;
  onToggleNotify: (feedId: string) => void;
}

/**
 * Feed selection section in the agent editor.
 * Thin wrapper around FeedMultiSelect that provides the editor-specific
 * FieldGroup framing and selected-count action.
 */
export function FeedsSection({ configuredFeeds, onToggle, onToggleNotify }: FeedsSectionProps) {
  const countLabel = useSelectedFeedCountLabel(configuredFeeds.length);
  const action = countLabel ? <span className="text-2xs text-text-muted">{countLabel}</span> : undefined;

  return (
    <FieldGroup label="Feeds" action={action}>
      <FeedMultiSelect
        configuredFeeds={configuredFeeds}
        onToggle={onToggle}
        onToggleNotify={onToggleNotify}
        helperText="Feeds the agent can read from. Toggle the bell to be notified when new items arrive."
      />
    </FieldGroup>
  );
}
