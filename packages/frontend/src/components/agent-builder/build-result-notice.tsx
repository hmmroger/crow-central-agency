import { X } from "lucide-react";
import type { AgentBuilderBuildResult } from "@crow-central-agency/shared";
import { cn } from "../../utils/cn.js";

interface BuildResultNoticeProps {
  result: AgentBuilderBuildResult;
  onDismiss: () => void;
}

/** Pluralize "agent" by count. */
function agentCountLabel(count: number): string {
  return `${count} agent${count === 1 ? "" : "s"}`;
}

/**
 * Dismissible summary of the last build. All-success shows a success-toned "created N" notice; a
 * partial build shows a warning-toned summary directing the user to the flagged agents.
 */
export function BuildResultNotice({ result, onDismiss }: BuildResultNoticeProps) {
  const createdCount = result.created.length;
  const failedCount = result.failed.length;
  if (createdCount === 0 && failedCount === 0) {
    return null;
  }

  const hasFailures = failedCount > 0;
  const message = hasFailures
    ? `Created ${agentCountLabel(createdCount)}; ${agentCountLabel(failedCount)} could not be built — fix the flagged agents and build again.`
    : `Created ${agentCountLabel(createdCount)}.`;

  return (
    <div
      className={cn(
        "mx-6 mt-3 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs",
        hasFailures ? "border-warning/20 bg-warning/10 text-warning" : "border-success/20 bg-success/10 text-success"
      )}
    >
      <span>{message}</span>
      <button
        type="button"
        className="shrink-0 text-text-muted hover:text-text-base transition-colors"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
