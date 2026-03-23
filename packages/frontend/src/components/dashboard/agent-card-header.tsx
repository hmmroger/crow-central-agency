import { AGENT_STATUS, type AgentConfig, type AgentStatus } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import { GearIcon } from "../icons/gear-icon.js";

interface AgentCardHeaderProps {
  agent: AgentConfig;
  status: AgentStatus;
  expanded: boolean;
  onToggleExpand: () => void;
}

/**
 * Agent card header — name, status badge, settings button, expand/collapse.
 */
export function AgentCardHeader({ agent, status, expanded, onToggleExpand }: AgentCardHeaderProps) {
  const goToAgentEditor = useAppStore((state) => state.goToAgentEditor);
  const goToConsole = useAppStore((state) => state.goToConsole);

  const statusColors: Record<AgentStatus, string> = {
    [AGENT_STATUS.IDLE]: "bg-text-muted",
    [AGENT_STATUS.STREAMING]: "bg-primary",
    [AGENT_STATUS.WAITING_PERMISSION]: "bg-warning",
    [AGENT_STATUS.WAITING_AGENT]: "bg-info",
    [AGENT_STATUS.COMPACTING]: "bg-secondary",
    [AGENT_STATUS.ERROR]: "bg-error",
  };

  return (
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => goToConsole(agent.id)}>
        <div className="flex items-center gap-2">
          <span className={`shrink-0 w-2 h-2 rounded-full ${statusColors[status]}`} />
          <h3 className="text-sm font-semibold text-text-primary truncate">{agent.name}</h3>
        </div>
        {agent.description && <p className="mt-0.5 ml-4 text-xs text-text-muted truncate">{agent.description}</p>}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpand();
          }}
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {expanded ? <path d="m18 15-6-6-6 6" /> : <path d="m6 9 6 6 6-6" />}
          </svg>
        </button>
        <button
          type="button"
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          onClick={(event) => {
            event.stopPropagation();
            goToAgentEditor(agent.id);
          }}
          title="Edit agent"
        >
          <GearIcon size={12} />
        </button>
      </div>
    </div>
  );
}
