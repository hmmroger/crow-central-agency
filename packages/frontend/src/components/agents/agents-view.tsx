import { useAppStore } from "../../stores/app-store.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { AgentCommandStrip } from "./agent-command-strip.js";
import { AgentConsole } from "./console/agent-console.js";

/**
 * Agents view - command strip (left) + agent console (right).
 * When no agent is selected, shows an empty state placeholder.
 */
export function AgentsView() {
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);

  return (
    <div className="flex h-full">
      <HeaderPortal title="Agents" />
      <AgentCommandStrip />

      {/* Console panel - shows selected agent or empty state */}
      <div className="flex-1 min-w-0">
        {selectedAgentId ? (
          <AgentConsole agentId={selectedAgentId} />
        ) : (
          <div className="h-full flex items-center justify-center text-text-muted text-sm">Select an agent</div>
        )}
      </div>
    </div>
  );
}
