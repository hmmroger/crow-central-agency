import { AGENT_STATUS, type AgentConfig, type AgentStatus, type SessionUsage } from "@crow-central-agency/shared";
import { STATUS_DOT_COLOR, STATUS_LABEL } from "../../utils/agent-status-display.js";

interface ConsoleStatusBarProps {
  agent: AgentConfig;
  status: AgentStatus;
  usage: SessionUsage;
}

/**
 * Thin status bar showing agent status indicator, model, and usage stats.
 * Sits below the app header within the console view.
 */
export function ConsoleStatusBar({ agent, status, usage }: ConsoleStatusBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-b border-border-subtle text-xs text-text-muted shrink-0">
      {/* Left: status + model */}
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <span
            className={`shrink-0 w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLOR[status]} ${status === AGENT_STATUS.STREAMING ? "animate-pulse" : ""}`}
          />
          {STATUS_LABEL[status]}
        </span>
        <span className="font-mono">{agent.model}</span>
      </div>

      {/* Right: usage stats */}
      <div className="flex items-center gap-3">
        {usage.totalCostUsd > 0 && <span>${usage.totalCostUsd.toFixed(4)}</span>}
        {usage.contextTotal > 0 && (
          <span>
            {Math.round(usage.contextUsed / 1000)}k / {Math.round(usage.contextTotal / 1000)}k
          </span>
        )}
      </div>
    </div>
  );
}
