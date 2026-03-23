import { ArrowLeft, FolderOpen, Minimize2, Plus } from "lucide-react";
import { AGENT_STATUS, type AgentConfig, type AgentStatus, type SessionUsage } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";

interface AgentConsoleHeaderProps {
  agent: AgentConfig;
  status: AgentStatus;
  usage: SessionUsage;
  isStreaming: boolean;
  onCompact: () => void;
  onNewSession: () => void;
  onToggleArtifacts?: () => void;
  showingArtifacts?: boolean;
}

/** Status badge color map */
const STATUS_COLOR_MAP: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "bg-text-muted",
  [AGENT_STATUS.STREAMING]: "bg-primary",
  [AGENT_STATUS.WAITING_PERMISSION]: "bg-warning",
  [AGENT_STATUS.WAITING_AGENT]: "bg-info",
  [AGENT_STATUS.COMPACTING]: "bg-secondary",
  [AGENT_STATUS.ERROR]: "bg-error",
};

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
  onToggleArtifacts,
  showingArtifacts,
}: AgentConsoleHeaderProps) {
  const goToDashboard = useAppStore((state) => state.goToDashboard);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface/80 backdrop-blur-sm">
      {/* Left: back + agent info */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors text-sm"
          onClick={goToDashboard}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{agent.name}</h2>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR_MAP[status]}`} />
              {status}
            </span>
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
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-30"
            onClick={onCompact}
            disabled={isStreaming}
            title="Compact context"
          >
            <Minimize2 className="h-3 w-3" />
            Compact
          </button>
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
            onClick={onNewSession}
            title="New session"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
          {onToggleArtifacts && (
            <button
              type="button"
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                showingArtifacts
                  ? "text-primary bg-primary/10"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-elevated"
              }`}
              onClick={onToggleArtifacts}
              title="Toggle artifacts"
            >
              <FolderOpen className="h-3 w-3" />
              Artifacts
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
