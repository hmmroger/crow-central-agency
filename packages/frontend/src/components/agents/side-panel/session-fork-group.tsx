import { GitBranch } from "lucide-react";
import type { SessionFork } from "@crow-central-agency/shared";
import { cn } from "../../../utils/cn.js";
import { formatRelativeTime } from "../../../utils/format-utils.js";

interface SessionForkGroupProps {
  title: string;
  forks: SessionFork[];
  disabled: boolean;
  onSelect: (sessionId: string) => void;
}

export function SessionForkGroup({ title, forks, disabled, onSelect }: SessionForkGroupProps) {
  return (
    <div className="py-1">
      <div title={title} className="px-3 py-0.5 text-2xs text-text-muted truncate">
        {title}
      </div>
      {forks.map((fork) => (
        <button
          key={fork.sessionId}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(fork.sessionId)}
          title={fork.label}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
            disabled ? "cursor-default opacity-50" : "hover:bg-surface-elevated"
          )}
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <span className="flex-1 min-w-0">
            <span className="block text-xs truncate text-text-neutral">{fork.label}</span>
            <span className="block text-2xs text-text-muted">{formatRelativeTime(fork.lastUpdatedTimestamp)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
