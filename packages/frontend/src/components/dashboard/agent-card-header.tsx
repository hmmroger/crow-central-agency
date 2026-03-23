import { ChevronDown, ChevronUp, Settings } from "lucide-react";
import { AGENT_STATUS, type AgentConfig, type AgentStatus } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";

interface AgentCardHeaderProps {
  agent: AgentConfig;
  status: AgentStatus;
  expanded: boolean;
  onToggleExpand: () => void;
}

/** Status badge color map — module-level constant */
const STATUS_COLOR_MAP: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "bg-text-muted",
  [AGENT_STATUS.STREAMING]: "bg-primary",
  [AGENT_STATUS.WAITING_PERMISSION]: "bg-warning",
  [AGENT_STATUS.WAITING_AGENT]: "bg-info",
  [AGENT_STATUS.COMPACTING]: "bg-secondary",
  [AGENT_STATUS.ERROR]: "bg-error",
};

/**
 * Agent card header — name, status badge, settings button, expand/collapse.
 */
export function AgentCardHeader({ agent, status, expanded, onToggleExpand }: AgentCardHeaderProps) {
  const goToAgentEditor = useAppStore((state) => state.goToAgentEditor);
  const goToConsole = useAppStore((state) => state.goToConsole);

  return (
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => goToConsole(agent.id)}>
        <div className="flex items-center gap-2">
          <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${STATUS_COLOR_MAP[status]}`} />
          <h3 className="text-sm font-semibold text-text-primary truncate">{agent.name}</h3>
        </div>
        {agent.description && <p className="mt-0.5 ml-5 text-xs text-text-muted truncate">{agent.description}</p>}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
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
