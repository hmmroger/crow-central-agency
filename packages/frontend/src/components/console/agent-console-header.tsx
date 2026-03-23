import { AGENT_STATUS, type AgentConfig, type AgentStatus, type SessionUsage } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";

interface AgentConsoleHeaderProps {
  agent: AgentConfig;
  status: AgentStatus;
  usage: SessionUsage;
  isStreaming: boolean;
  onCompact: () => void;
  onNewSession: () => void;
}

/**
 * Console header — agent name, status, usage stats, compact/new session buttons.
 */
export function AgentConsoleHeader({
  agent,
  status,
  usage,
  isStreaming,
  onCompact,
  onNewSession,
}: AgentConsoleHeaderProps) {
  const goToDashboard = useAppStore((state) => state.goToDashboard);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface/80 backdrop-blur-sm">
      {/* Left: back + agent info */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-text-muted hover:text-text-primary transition-colors text-sm"
          onClick={goToDashboard}
        >
          &larr; Back
        </button>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{agent.name}</h2>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <StatusBadge status={status} />
            <span className="font-mono">{agent.model}</span>
          </div>
        </div>
      </div>

      {/* Right: usage + actions */}
      <div className="flex items-center gap-4">
        {/* Usage stats */}
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {usage.totalCostUsd > 0 && <span>${usage.totalCostUsd.toFixed(4)}</span>}
          {usage.contextTotal > 0 && (
            <span>
              {Math.round(usage.contextUsed / 1000)}k / {Math.round(usage.contextTotal / 1000)}k
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-30"
            onClick={onCompact}
            disabled={isStreaming}
            title="Compact context"
          >
            Compact
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
            onClick={onNewSession}
            title="New session"
          >
            New
          </button>
        </div>
      </div>
    </div>
  );
}

/** Status indicator badge */
function StatusBadge({ status }: { status: AgentStatus }) {
  const colorMap: Record<AgentStatus, string> = {
    [AGENT_STATUS.IDLE]: "bg-text-muted",
    [AGENT_STATUS.STREAMING]: "bg-primary",
    [AGENT_STATUS.WAITING_PERMISSION]: "bg-warning",
    [AGENT_STATUS.WAITING_AGENT]: "bg-info",
    [AGENT_STATUS.COMPACTING]: "bg-secondary",
    [AGENT_STATUS.ERROR]: "bg-error",
  };

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${colorMap[status]}`} />
      {status}
    </span>
  );
}
