import { useMemo } from "react";
import { useAgentsContext } from "../../providers/agents-provider.js";
import { useCirclesQuery } from "../../hooks/queries/use-circles-query.js";
import { useRelationshipsQuery } from "../../hooks/queries/use-relationships-query.js";
import { useDashboardSettingsQuery } from "../../hooks/queries/use-dashboard-settings.js";
import { useAppStore } from "../../stores/app-store.js";
import { flattenAgentsByCircleOrder } from "../../utils/circle-agent-order.js";
import { AgentCommandPill } from "./agent-command-pill.js";

/**
 * Vertical strip of agent command pills - shows all agents as square buttons.
 * Selected agent gets a primary border; active agents show a dot indicator.
 * Pills mirror the dashboard layout: pinned agents first, then grouped by
 * circle in displayOrder, with the saved per-circle agent order applied
 * within each circle.
 * Sits to the left of the agent console in the Agents view.
 */
export function AgentCommandStrip() {
  const { agents } = useAgentsContext();
  const { data: circles = [] } = useCirclesQuery();
  const { data: relationships = [] } = useRelationshipsQuery();
  const { data: dashboardSettings } = useDashboardSettingsQuery();
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const selectAgent = useAppStore((state) => state.selectAgent);

  const orderedAgents = useMemo(
    () =>
      flattenAgentsByCircleOrder(
        agents,
        circles,
        relationships,
        dashboardSettings?.circleAgentOrder,
        dashboardSettings?.pinnedAgentOrder
      ),
    [agents, circles, relationships, dashboardSettings?.circleAgentOrder, dashboardSettings?.pinnedAgentOrder]
  );

  return (
    <div className="hidden md:flex flex-col items-center gap-4 w-14 py-3 shrink-0 overflow-y-auto border-r border-border-subtle/20 bg-surface">
      {orderedAgents.map((agent) => (
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
