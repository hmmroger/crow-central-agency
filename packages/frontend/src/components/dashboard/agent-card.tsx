import { AGENT_STATUS, type AgentConfig } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import { GearIcon } from "../icons/gear-icon.js";

interface AgentCardProps {
  agent: AgentConfig;
}

/**
 * Agent card — displays agent name, description, model, and status.
 * Click to navigate to console. Settings button opens editor.
 * Phase 2+ will add real-time status, mini-console, usage badges.
 */
export function AgentCard({ agent }: AgentCardProps) {
  const goToConsole = useAppStore((state) => state.goToConsole);
  const goToAgentEditor = useAppStore((state) => state.goToAgentEditor);

  return (
    <div
      className="group relative flex flex-col gap-3 p-4 rounded-lg bg-surface border border-border-subtle hover:border-border transition-colors cursor-pointer"
      onClick={() => goToConsole(agent.id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary truncate">{agent.name}</h3>
          {agent.description && <p className="mt-0.5 text-xs text-text-muted truncate">{agent.description}</p>}
        </div>

        {/* Settings button */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated"
          onClick={(event) => {
            event.stopPropagation();
            goToAgentEditor(agent.id);
          }}
          title="Edit agent"
        >
          <GearIcon />
        </button>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-inset font-mono">
          {agent.model}
        </span>
        {/* TODO Phase 2: replace with live status from runtime state */}
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-inset">
          {AGENT_STATUS.IDLE}
        </span>
      </div>
    </div>
  );
}
