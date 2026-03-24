import { Maximize2, Settings } from "lucide-react";
import { AGENT_STATUS, type AgentConfig, type AgentStatus } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import { STATUS_DOT_COLOR, STATUS_TEXT_COLOR, STATUS_LABEL } from "../../utils/agent-status-display.js";

interface AgentCardHeaderProps {
  agent: AgentConfig;
  status: AgentStatus;
  onToggleExpand: () => void;
}

/**
 * Agent card header — name (click to toggle expand/collapse), status indicator, actions.
 */
export function AgentCardHeader({ agent, status, onToggleExpand }: AgentCardHeaderProps) {
  const goToAgentEditor = useAppStore((state) => state.goToAgentEditor);
  const goToConsole = useAppStore((state) => state.goToConsole);

  return (
    <div className="flex items-center justify-between">
      {/* Name — click to toggle collapse/expand */}
      <div className="flex-1 min-w-0 cursor-pointer select-none" onClick={onToggleExpand}>
        <h3 className="text-sm font-semibold text-text-primary truncate">{agent.name}</h3>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-1.5 mr-2 shrink-0">
        <span
          className={`shrink-0 w-2 h-2 rounded-full ${STATUS_DOT_COLOR[status]} ${status === AGENT_STATUS.STREAMING ? "animate-pulse" : ""}`}
        />
        <span className={`text-xs font-medium ${STATUS_TEXT_COLOR[status]}`}>{STATUS_LABEL[status]}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          onClick={(event) => {
            event.stopPropagation();
            goToAgentEditor(agent.id);
          }}
          title="Edit agent"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          onClick={(event) => {
            event.stopPropagation();
            goToConsole(agent.id);
          }}
          title="Open console"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
