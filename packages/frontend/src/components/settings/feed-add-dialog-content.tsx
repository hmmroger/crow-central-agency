import { useState, useCallback } from "react";
import { ArrowLeft, Rss } from "lucide-react";
import type { FeedInfo } from "@crow-central-agency/shared";
import { useAddFeed, useDetectFeeds } from "../../hooks/queries/use-feed-mutations.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { FieldGroup } from "../agent-editor/field-group.js";
import { formatUrlDomain } from "../../utils/format-utils.js";

interface FeedAddDialogContentProps {
  onClose: () => void;
}

type DialogStage = "input" | "select";

/**
 * Dialog content for adding a feed.
 * Stage 1: user enters a URL. The backend is asked to detect feed links from
 *   the page. If 0 feeds are detected, the entered URL is added directly.
 *   If 1 is detected, it is added. If 2+ are detected, we switch to stage 2.
 * Stage 2: user picks one of the detected feeds to add.
 */
export function FeedAddDialogContent({ onClose }: FeedAddDialogContentProps) {
  const [pageUrl, setPageUrl] = useState("");
  const [stage, setStage] = useState<DialogStage>("input");
  const [detectedFeeds, setDetectedFeeds] = useState<FeedInfo[]>([]);

  const detectFeeds = useDetectFeeds();
  const addFeed = useAddFeed();

  const isBusy = detectFeeds.isPending || addFeed.isPending;
  const errorMessage = detectFeeds.error?.message ?? addFeed.error?.message;

  const canSubmitInput = !isBusy && pageUrl.trim() !== "";

  const addAndClose = useCallback(
    async (feedUrl: string) => {
      try {
        await addFeed.mutateAsync({ feedUrl });
        onClose();
      } catch {
        // surfaced via addFeed.error
      }
    },
    [addFeed, onClose]
  );

  const handleDetectAndAdd = useCallback(async () => {
    const trimmed = pageUrl.trim();
    if (!trimmed) {
      return;
    }

    try {
      const feeds = await detectFeeds.mutateAsync({ url: trimmed });

      if (feeds.length === 0) {
        await addAndClose(trimmed);
        return;
      }

      if (feeds.length === 1) {
        await addAndClose(feeds[0].feedUrl);
        return;
      }

      setDetectedFeeds(feeds);
      setStage("select");
    } catch {
      // surfaced via detectFeeds.error
    }
  }, [pageUrl, detectFeeds, addAndClose]);

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && canSubmitInput) {
        void handleDetectAndAdd();
      }
    },
    [canSubmitInput, handleDetectAndAdd]
  );

  const handleBackToInput = useCallback(() => {
    setStage("input");
    setDetectedFeeds([]);
    addFeed.reset();
    detectFeeds.reset();
  }, [addFeed, detectFeeds]);

  const handlePickFeed = useCallback(
    (feed: FeedInfo) => {
      void addAndClose(feed.feedUrl);
    },
    [addAndClose]
  );

  const handleAddClick = useCallback(() => {
    void handleDetectAndAdd();
  }, [handleDetectAndAdd]);

  const isSelectStage = stage === "select";

  return (
    <div className="flex flex-col min-h-0">
      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm animate-fade-slide-up">
            {errorMessage}
          </div>
        )}

        {isSelectStage ? (
          <FeedSelectList feeds={detectedFeeds} disabled={isBusy} onPick={handlePickFeed} />
        ) : (
          <FieldGroup label="Feed or Page URL" required>
            <input
              type="url"
              value={pageUrl}
              onChange={(event) => setPageUrl(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="https://example.com"
              disabled={isBusy}
              className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus disabled:opacity-60"
              autoFocus
            />
            <p className="text-2xs text-text-muted mt-1">
              Paste a feed URL directly, or a page URL to detect its feeds.
            </p>
          </FieldGroup>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        {isSelectStage && <ActionButton icon={ArrowLeft} label="Back" onClick={handleBackToInput} disabled={isBusy} />}
        <ActionButton label="Cancel" onClick={onClose} />
        {!isSelectStage && (
          <ActionButton
            label={detectFeeds.isPending ? "Detecting..." : addFeed.isPending ? "Adding..." : "Add"}
            onClick={handleAddClick}
            disabled={!canSubmitInput}
            variant={ACTION_BUTTON_VARIANT.PRIMARY}
          />
        )}
      </div>
    </div>
  );
}

interface FeedSelectListProps {
  feeds: FeedInfo[];
  disabled: boolean;
  onPick: (feed: FeedInfo) => void;
}

/** List of detected feeds; selecting one adds it. */
function FeedSelectList({ feeds, disabled, onPick }: FeedSelectListProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-text-muted">Multiple feeds were detected on this page. Select one to add.</p>
      <ul className="rounded-lg border border-border-subtle/60 bg-surface divide-y divide-border-subtle/40">
        {feeds.map((feed) => (
          <li key={feed.feedUrl}>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-elevated/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={() => onPick(feed)}
              disabled={disabled}
            >
              {feed.imageUrl ? (
                <img src={feed.imageUrl} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
              ) : (
                <div className="h-6 w-6 rounded bg-surface-elevated shrink-0 flex items-center justify-center">
                  <Rss className="h-3.5 w-3.5 text-text-muted" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-base truncate">{feed.title}</div>
                <div className="text-xs text-text-muted truncate">{formatUrlDomain(feed.feedUrl)}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
