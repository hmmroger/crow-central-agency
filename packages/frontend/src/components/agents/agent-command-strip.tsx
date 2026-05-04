import { useAgentsContext } from "../../providers/agents-provider.js";
import { useAppStore } from "../../stores/app-store.js";
import { AgentCommandPill } from "./agent-command-pill.js";

/**
 * Vertical strip of agent command pills - shows all agents as square buttons.
 * Selected agent gets a primary border; active agents show a dot indicator.
 * Sits to the left of the agent console in the Agents view.
 */
export function AgentCommandStrip() {
  const { agents } = useAgentsContext();
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const selectAgent = useAppStore((state) => state.selectAgent);

  return (
    <div className="hidden md:flex flex-col items-center gap-4 w-14 py-3 shrink-0 overflow-y-auto border-r border-border-subtle/20 bg-surface">
      {agents.map((agent) => (
        <AgentCommandPill
          key={agent.id}
          agent={agent}
          isSelected={selectedAgentId === agent.id}
          onClick={() => selectAgent(agent.id)}
        />
      ))}
    </div>
  );
}
