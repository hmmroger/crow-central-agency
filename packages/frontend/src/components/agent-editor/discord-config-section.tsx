import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface DiscordConfigSectionProps {
  enabled: boolean;
  botToken: string;
  channelIds: string[];
  allowedUserIds: string[];
  respondToMentionsOnly: boolean;
  syncBotName: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onBotTokenChange: (token: string) => void;
  onAddChannelId: (channelId: string) => void;
  onRemoveChannelId: (channelId: string) => void;
  onAddAllowedUserId: (userId: string) => void;
  onRemoveAllowedUserId: (userId: string) => void;
  onRespondToMentionsOnlyChange: (value: boolean) => void;
  onSyncBotNameChange: (value: boolean) => void;
}

/**
 * Discord configuration section in the agent editor.
 * Allows configuring a Discord bot token, channel IDs, allowed users, and mention mode.
 */
export function DiscordConfigSection({
  enabled,
  botToken,
  channelIds,
  allowedUserIds,
  respondToMentionsOnly,
  syncBotName,
  onEnabledChange,
  onBotTokenChange,
  onAddChannelId,
  onRemoveChannelId,
  onAddAllowedUserId,
  onRemoveAllowedUserId,
  onRespondToMentionsOnlyChange,
  onSyncBotNameChange,
}: DiscordConfigSectionProps) {
  const [showToken, setShowToken] = useState(false);
  const [channelIdInput, setChannelIdInput] = useState("");
  const [userIdInput, setUserIdInput] = useState("");

  const handleAddChannelId = () => {
    const trimmed = channelIdInput.trim();
    if (trimmed) {
      onAddChannelId(trimmed);
      setChannelIdInput("");
    }
  };

  const handleAddUserId = () => {
    const trimmed = userIdInput.trim();
    if (trimmed) {
      onAddAllowedUserId(trimmed);
      setUserIdInput("");
    }
  };

  const handleChannelIdKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddChannelId();
    }
  };

  const handleUserIdKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddUserId();
    }
  };

  return (
    <FieldGroup label="Discord">
      <div className="space-y-3">
        {/* Enable toggle */}
        <Toggle checked={enabled} onChange={onEnabledChange} label="Enable Discord bot" />

        {enabled && (
          <>
            {/* Bot Token */}
            <div>
              <label className="text-xs text-text-muted block mb-1">Bot Token</label>
              <div className="flex gap-2">
                <input
                  type={showToken ? "text" : "password"}
                  value={botToken}
                  onChange={(event) => onBotTokenChange(event.target.value)}
                  placeholder="Discord bot token"
                  className="flex-1 px-2 py-1.5 text-xs bg-surface-inset border border-border-subtle rounded-md text-text-base placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  className="px-2 py-1.5 text-2xs text-text-muted hover:text-text-base bg-surface-elevated border border-border-subtle rounded-md transition-colors"
                >
                  {showToken ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Allowed User IDs */}
            <div>
              <label className="text-xs text-text-muted block mb-1">
                Allowed User IDs
                <span className="ml-1 text-text-muted/60">(optional — leave empty to allow anyone)</span>
              </label>
              <IdTagList ids={allowedUserIds} onRemove={onRemoveAllowedUserId} />
              <div className="flex gap-2 mt-1.5">
                <input
                  type="text"
                  value={userIdInput}
                  onChange={(event) => setUserIdInput(event.target.value)}
                  onKeyDown={handleUserIdKeyDown}
                  placeholder="Discord user ID"
                  className="flex-1 px-2 py-1.5 text-xs bg-surface-inset border border-border-subtle rounded-md text-text-base placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddUserId}
                  disabled={!userIdInput.trim()}
                  className="flex items-center gap-1 px-2 py-1.5 text-2xs text-text-muted hover:text-text-base bg-surface-elevated border border-border-subtle rounded-md transition-colors disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
            </div>

            {/* Channel IDs */}
            <div>
              <label className="text-xs text-text-muted block mb-1">
                Channel IDs
                <span className="ml-1 text-text-muted/60">(optional — leave empty for DM-only)</span>
              </label>
              <IdTagList ids={channelIds} onRemove={onRemoveChannelId} />
              <div className="flex gap-2 mt-1.5">
                <input
                  type="text"
                  value={channelIdInput}
                  onChange={(event) => setChannelIdInput(event.target.value)}
                  onKeyDown={handleChannelIdKeyDown}
                  placeholder="Discord channel ID"
                  className="flex-1 px-2 py-1.5 text-xs bg-surface-inset border border-border-subtle rounded-md text-text-base placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddChannelId}
                  disabled={!channelIdInput.trim()}
                  className="flex items-center gap-1 px-2 py-1.5 text-2xs text-text-muted hover:text-text-base bg-surface-elevated border border-border-subtle rounded-md transition-colors disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
            </div>

            {/* Respond to mentions only */}
            {channelIds.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={respondToMentionsOnly}
                  onChange={(event) => onRespondToMentionsOnlyChange(event.target.checked)}
                  className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30"
                />
                <span className="text-xs text-text-neutral">Respond to @mentions only (in channels)</span>
              </label>
            )}

            {/* Sync bot name */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncBotName}
                onChange={(event) => onSyncBotNameChange(event.target.checked)}
                className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30"
              />
              <span className="text-xs text-text-neutral">Sync bot username to agent name</span>
            </label>
          </>
        )}
      </div>
    </FieldGroup>
  );
}

/** Renders a list of ID tags with remove buttons */
function IdTagList({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) {
  if (ids.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <span
          key={id}
          className="flex items-center gap-1 px-2 py-0.5 text-2xs font-mono bg-surface-elevated border border-border-subtle rounded-md text-text-neutral"
        >
          {id}
          <button
            type="button"
            onClick={() => onRemove(id)}
            className="text-text-muted hover:text-error transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
