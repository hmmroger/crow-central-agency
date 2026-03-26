import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { useAppStore } from "../../stores/app-store.js";
import { AgentCommandPill } from "./agent-command-pill.js";

/**
 * Vertical strip of agent command pills — shows all agents as small square buttons.
 * Selected agent gets a primary border; streaming agents show a dot indicator.
 * Sits to the left of the agent console in the Agents view.
 */
export function AgentCommandStrip() {
  const { data: agents = [] } = useAgentsQuery();
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const selectAgent = useAppStore((state) => state.selectAgent);

  return (
    <div className="flex flex-col gap-2 p-2 w-14 shrink-0 overflow-y-auto border-r border-border-subtle bg-base">
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
