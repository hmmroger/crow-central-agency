import { useCallback, useMemo } from "react";
import { Bot } from "lucide-react";
import { useAgentsContext } from "../../providers/agents-provider.js";
import type { HeaderAction, HeaderDropdownConfig } from "../../providers/header-provider.types.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { useAppStore } from "../../stores/app-store.js";
import { useFullPanel } from "../../hooks/use-full-panel.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { AgentCommandStrip } from "./agent-command-strip.js";
import { AgentConsole } from "./console/agent-console.js";
import { SIDE_PANEL_TABS } from "./side-panel/side-panel-tabs.js";
import { SidePanelTabContent } from "./side-panel/side-panel-tab-content.js";

const HEADER_AGENT_DROPDOWN_ID = "header-agent-selector";
const FULL_PANEL_ID_PREFIX = "side-panel-";

/**
 * Agents view - command strip (left) + agent console (right).
 * When no agent is selected, shows an empty state placeholder.
 * Owns the header title (agent name when selected, "Agents" otherwise),
 * an agent-picker dropdown attached to the title, and per-tab header
 * actions that open the side panel content as a full-region takeover on
 * narrow screens where the resizable side panel is hidden.
 */
export function AgentsView() {
  const { agents, getAgent } = useAgentsContext();
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const selectAgent = useAppStore((state) => state.selectAgent);
  const selectedAgent = getAgent(selectedAgentId);
  const headerTitle = selectedAgent?.name ?? "Agents";
  const { show, hide, isOpen } = useFullPanel();

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

  const toggleFullPanel = useCallback(
    (id: string, title: string, tabId: (typeof SIDE_PANEL_TABS)[number]["id"]) => {
      if (isOpen(id)) {
        hide();
        return;
      }

      show({ id, title, content: <SidePanelTabContent tab={tabId} /> });
    },
    [isOpen, hide, show]
  );

  const headerActions = useMemo<HeaderAction[]>(
    () =>
      SIDE_PANEL_TABS.map((tab) => {
        const id = `${FULL_PANEL_ID_PREFIX}${tab.id}`;
        return {
          id,
          label: tab.label,
          icon: tab.icon,
          selected: isOpen(id),
          onClick: () => toggleFullPanel(id, tab.label, tab.id),
        };
      }),
    [isOpen, toggleFullPanel]
  );

  return (
    <div className="flex h-full">
      <HeaderPortal title={headerTitle} dropdown={headerDropdown} actions={headerActions} />
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
