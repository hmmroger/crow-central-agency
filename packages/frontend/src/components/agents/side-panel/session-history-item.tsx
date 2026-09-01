import { useCallback, useRef, useState } from "react";
import { GitBranch, MessageSquare, Pencil } from "lucide-react";
import { SESSION_LABEL_MAX_LENGTH, type SessionHistoryNode } from "@crow-central-agency/shared";
import { cn } from "../../../utils/cn.js";
import { formatRelativeTime } from "../../../utils/format-utils.js";

interface SessionHistoryItemProps {
  node: SessionHistoryNode;
  isCurrent: boolean;
  disabled: boolean;
  onSelect: (sessionId: string) => void;
  onRename: (sessionId: string, label: string) => void;
}

/** Deeper branches stop indenting, so a long fork chain cannot push its labels off the panel. */
const MAX_RAIL_DEPTH = 4;

export function SessionHistoryItem({ node, isCurrent, disabled, onSelect, onRename }: SessionHistoryItemProps) {
  // A draft is the editing state: undefined means the row shows its label.
  const [draftLabel, setDraftLabel] = useState<string>();
  const isCancellingRef = useRef(false);
  const railDepth = Math.min(node.depth, MAX_RAIL_DEPTH);

  const handleClick = useCallback(() => onSelect(node.sessionId), [onSelect, node.sessionId]);
  const handleEditClick = useCallback(() => setDraftLabel(node.label), [node.label]);
  const handleDraftChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setDraftLabel(event.target.value),
    []
  );

  const handleCommit = useCallback(() => {
    if (isCancellingRef.current) {
      isCancellingRef.current = false;

      return;
    }

    const trimmedLabel = draftLabel?.trim();
    setDraftLabel(undefined);
    if (trimmedLabel && trimmedLabel !== node.label) {
      onRename(node.sessionId, trimmedLabel);
    }
  }, [draftLabel, node.label, node.sessionId, onRename]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        handleCommit();
      } else if (event.key === "Escape") {
        isCancellingRef.current = true;
        setDraftLabel(undefined);
      }
    },
    [handleCommit]
  );

  const SessionIcon = node.isBranch ? GitBranch : MessageSquare;

  return (
    <div
      className={cn(
        "group w-full flex items-stretch pl-3 transition-colors",
        isCurrent ? "bg-primary/15" : "hover:bg-surface-elevated"
      )}
    >
      {Array.from({ length: railDepth }, (_unused, level) => (
        <span key={level} className="w-3 shrink-0 border-l border-border-subtle" />
      ))}
      <div className="flex-1 min-w-0 flex items-center gap-2 pr-2 py-1.5">
        <SessionIcon className={cn("h-3.5 w-3.5 shrink-0", isCurrent ? "text-primary" : "text-text-muted")} />
        {draftLabel === undefined ? (
          <button
            type="button"
            disabled={disabled}
            onClick={handleClick}
            title={node.label}
            aria-current={isCurrent}
            className={cn(
              "flex-1 min-w-0 text-left",
              disabled && "cursor-default",
              disabled && !isCurrent && "opacity-50"
            )}
          >
            <div className={cn("text-xs truncate", isCurrent ? "text-primary" : "text-text-neutral")}>{node.label}</div>
            <div className="text-2xs text-text-muted">{formatRelativeTime(node.lastUpdatedTimestamp)}</div>
          </button>
        ) : (
          <input
            type="text"
            autoFocus
            value={draftLabel}
            maxLength={SESSION_LABEL_MAX_LENGTH}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            onBlur={handleCommit}
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-surface-elevated border border-border-subtle text-xs text-text-base focus:outline-none focus:border-primary/50"
          />
        )}
        {draftLabel === undefined && (
          <button
            type="button"
            onClick={handleEditClick}
            title="Rename session"
            aria-label="Rename session"
            className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-text-muted hover:text-text-base transition-opacity"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
