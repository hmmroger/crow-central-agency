import { useCallback } from "react";
import { GitBranch } from "lucide-react";
import { AGENT_STATUS, type AgentMessage } from "@crow-central-agency/shared";
import { useAgentStateQuery } from "../../../hooks/queries/use-agent-state-query.js";
import { usePendingBranch } from "../../../stores/branch-anchor-store.js";

interface MessageBranchButtonProps {
  agentId: string;
  message: AgentMessage;
}

/**
 * Compact branch button rendered next to a message.
 * Self-gates on the backend-issued `branchAnchor`: messages the transcript cannot be forked at
 * carry none and render nothing. Selecting one anchors the compose box rather than branching
 * immediately, so the tail that will be discarded stays on screen until the user sends.
 */
export function MessageBranchButton({ agentId, message }: MessageBranchButtonProps) {
  const { pendingBranch, setPendingBranch, clearPendingBranch } = usePendingBranch(agentId);
  const { data: agentState } = useAgentStateQuery(agentId);
  const branchAnchor = message.branchAnchor;
  const isAnchored = pendingBranch?.messageId === message.id;

  const handleClick = useCallback(() => {
    if (isAnchored) {
      clearPendingBranch();
      return;
    }

    if (branchAnchor) {
      setPendingBranch({ messageId: message.id, anchor: branchAnchor });
    }
  }, [isAnchored, branchAnchor, message.id, setPendingBranch, clearPendingBranch]);

  if (!branchAnchor) {
    return null;
  }

  const isIdle = agentState?.status === AGENT_STATUS.IDLE;
  const ariaLabel = !isIdle
    ? "Agent must be idle to branch"
    : isAnchored
      ? "Cancel branching from this message"
      : "Branch from this message";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isIdle}
      data-active={isAnchored ? "true" : undefined}
      className="inline-flex items-center justify-center h-5 w-5 rounded border border-border-subtle text-3xs text-text-muted hover:text-text-neutral hover:bg-surface-elevated/50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <GitBranch className={isAnchored ? "h-3 w-3 text-primary" : "h-3 w-3"} />
    </button>
  );
}
