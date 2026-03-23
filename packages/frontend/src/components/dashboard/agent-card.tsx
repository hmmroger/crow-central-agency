import type { AgentConfig } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";

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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-inset font-mono">
          {agent.model}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-inset">idle</span>
      </div>
    </div>
  );
}
