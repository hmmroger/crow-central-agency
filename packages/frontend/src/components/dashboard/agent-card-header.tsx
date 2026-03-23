import { ChevronDown, ChevronUp, Settings } from "lucide-react";
import { AGENT_STATUS, type AgentConfig, type AgentStatus } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";

interface AgentCardHeaderProps {
  agent: AgentConfig;
  status: AgentStatus;
  expanded: boolean;
  onToggleExpand: () => void;
}

/** Status dot color map */
const STATUS_DOT_COLOR: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "bg-text-muted",
  [AGENT_STATUS.STREAMING]: "bg-primary",
  [AGENT_STATUS.WAITING_PERMISSION]: "bg-warning",
  [AGENT_STATUS.WAITING_AGENT]: "bg-info",
  [AGENT_STATUS.COMPACTING]: "bg-secondary",
  [AGENT_STATUS.ERROR]: "bg-error",
};

/** Status text color map */
const STATUS_TEXT_COLOR: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "text-text-muted",
  [AGENT_STATUS.STREAMING]: "text-primary",
  [AGENT_STATUS.WAITING_PERMISSION]: "text-warning",
  [AGENT_STATUS.WAITING_AGENT]: "text-info",
  [AGENT_STATUS.COMPACTING]: "text-secondary",
  [AGENT_STATUS.ERROR]: "text-error",
};

/** Status display labels */
const STATUS_LABEL: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "Idle",
  [AGENT_STATUS.STREAMING]: "Streaming",
  [AGENT_STATUS.WAITING_PERMISSION]: "Waiting Permission",
  [AGENT_STATUS.WAITING_AGENT]: "Waiting Agent",
  [AGENT_STATUS.COMPACTING]: "Compacting",
  [AGENT_STATUS.ERROR]: "Error",
};

/**
 * Agent card header — name, status indicator with label, settings, expand/collapse.
 */
export function AgentCardHeader({ agent, status, expanded, onToggleExpand }: AgentCardHeaderProps) {
  const goToAgentEditor = useAppStore((state) => state.goToAgentEditor);
  const goToConsole = useAppStore((state) => state.goToConsole);

  return (
    <div className="flex items-center justify-between">
      {/* Name — click to open console */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => goToConsole(agent.id)}>
        <h3 className="text-sm font-semibold text-text-primary truncate">{agent.name}</h3>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-1.5 mr-2">
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
            onToggleExpand();
          }}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
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
      </div>
    </div>
  );
}
