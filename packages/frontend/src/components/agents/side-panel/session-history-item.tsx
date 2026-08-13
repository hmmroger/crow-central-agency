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

/** Tailwind needs literal classes, so deeper branches share the last entry. */
const DEPTH_PADDING_CLASS = ["pl-3", "pl-6", "pl-9", "pl-12"] as const;

export function SessionHistoryItem({ node, isCurrent, disabled, onSelect }: SessionHistoryItemProps) {
  const handleClick = useCallback(() => onSelect(node.sessionId), [onSelect, node.sessionId]);
  const indentClass = DEPTH_PADDING_CLASS[Math.min(node.depth, DEPTH_PADDING_CLASS.length - 1)];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      title={node.label}
      className={cn(
        "w-full flex items-center gap-2 pr-3 py-1.5 text-left transition-colors",
        indentClass,
        isCurrent && "bg-surface-elevated",
        disabled ? "cursor-default" : "hover:bg-surface-elevated",
        disabled && !isCurrent && "opacity-50"
      )}
    >
      {node.isBranch ? (
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      ) : (
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      )}
      <div className="flex-1 min-w-0">
        <div className={cn("text-xs truncate", isCurrent ? "text-text-base" : "text-text-neutral")}>{node.label}</div>
        <div className="text-2xs text-text-muted">{formatRelativeTime(node.lastUpdatedTimestamp)}</div>
      </div>
      {isCurrent && <span className="shrink-0 font-mono text-3xs uppercase tracking-widest text-accent">Current</span>}
    </button>
  );
}
