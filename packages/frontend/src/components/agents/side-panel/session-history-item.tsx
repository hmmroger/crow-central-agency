import { useCallback } from "react";
import { GitBranch, MessageSquare } from "lucide-react";
import type { SessionHistoryNode } from "@crow-central-agency/shared";
import { cn } from "../../../utils/cn.js";
import { formatRelativeTime } from "../../../utils/format-utils.js";

interface SessionHistoryItemProps {
  node: SessionHistoryNode;
  isCurrent: boolean;
  disabled: boolean;
  onSelect: (sessionId: string) => void;
}

/** Deeper branches stop indenting, so a long fork chain cannot push its labels off the panel. */
const MAX_RAIL_DEPTH = 4;

export function SessionHistoryItem({ node, isCurrent, disabled, onSelect }: SessionHistoryItemProps) {
  const handleClick = useCallback(() => onSelect(node.sessionId), [onSelect, node.sessionId]);
  const railDepth = Math.min(node.depth, MAX_RAIL_DEPTH);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      title={node.label}
      aria-current={isCurrent}
      className={cn(
        "w-full flex items-stretch pl-3 text-left transition-colors",
        isCurrent ? "bg-primary/15" : !disabled && "hover:bg-surface-elevated",
        disabled && "cursor-default",
        disabled && !isCurrent && "opacity-50"
      )}
    >
      {Array.from({ length: railDepth }, (_unused, level) => (
        <span key={level} className="w-3 shrink-0 border-l border-border-subtle" />
      ))}
      <div className="flex-1 min-w-0 flex items-center gap-2 pr-3 py-1.5">
        {node.isBranch ? (
          <GitBranch className={cn("h-3.5 w-3.5 shrink-0", isCurrent ? "text-primary" : "text-text-muted")} />
        ) : (
          <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", isCurrent ? "text-primary" : "text-text-muted")} />
        )}
        <div className="flex-1 min-w-0">
          <div className={cn("text-xs truncate", isCurrent ? "text-primary" : "text-text-neutral")}>{node.label}</div>
          <div className="text-2xs text-text-muted">{formatRelativeTime(node.lastUpdatedTimestamp)}</div>
        </div>
      </div>
    </button>
  );
}
