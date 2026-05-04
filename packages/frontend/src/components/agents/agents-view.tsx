import { useMemo } from "react";
import { Bot } from "lucide-react";
import { useAgentsContext } from "../../providers/agents-provider.js";
import type { HeaderDropdownConfig } from "../../providers/header-provider.types.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { useAppStore } from "../../stores/app-store.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { AgentCommandStrip } from "./agent-command-strip.js";
import { AgentConsole } from "./console/agent-console.js";

const HEADER_AGENT_DROPDOWN_ID = "header-agent-selector";

/**
 * Agents view - command strip (left) + agent console (right).
 * When no agent is selected, shows an empty state placeholder.
 * Owns the header title (agent name when selected, "Agents" otherwise) and
 * an agent-picker dropdown attached to the title.
 */
export function AgentsView() {
  const { agents, getAgent } = useAgentsContext();
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const selectAgent = useAppStore((state) => state.selectAgent);
  const selectedAgent = getAgent(selectedAgentId);
  const headerTitle = selectedAgent?.name ?? "Agents";

  const headerDropdown = useMemo<HeaderDropdownConfig>(() => {
    const items: ContextMenuItem[] = agents
      .map((agent) => ({
        type: ContextMenuTypes.action,
        label: agent.name,
        icon: Bot,
        onClick: () => selectAgent(agent.id),
        selected: agent.id === selectedAgentId,
      }))
      .sort((item1, item2) => item1.label.localeCompare(item2.label));

    return { menuId: HEADER_AGENT_DROPDOWN_ID, items };
  }, [agents, selectedAgentId, selectAgent]);

  return (
    <div className="flex h-full">
      <HeaderPortal title={headerTitle} dropdown={headerDropdown} />
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
