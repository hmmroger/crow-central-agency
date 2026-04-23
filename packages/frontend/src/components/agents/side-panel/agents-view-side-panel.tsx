import { useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../../../stores/app-store.js";
import { TabBar } from "../../common/tab-bar.js";
import { SIDE_PANEL_TAB, SIDE_PANEL_TABS, type SidePanelTab } from "./side-panel-tabs.js";
import { StatusTab } from "./status-tab.js";
import { AgentArtifactsTab } from "./agent-artifacts-tab.js";
import { CircleArtifactsTab } from "./circle-artifacts-tab.js";

interface AgentSidePanelContentProps {
  agentId: string;
  activeTab: SidePanelTab;
}

/**
 * Side panel content for the Agents view.
 * TabBar with close action is always rendered; inner content depends on agent selection.
 */
export function AgentsViewSidePanel() {
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const toggleSidePanel = useAppStore((state) => state.toggleSidePanel);
  const [activeTab, setActiveTab] = useState<SidePanelTab>(SIDE_PANEL_TAB.STATUS);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border px-2 pt-1">
        <TabBar
          tabs={SIDE_PANEL_TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          layoutId="agentSidePanel"
          actionIcon={X}
          onActionClick={toggleSidePanel}
          actionTitle="Close side panel"
        />
      </div>

      {!selectedAgentId ? (
        <div className="flex items-center justify-center flex-1 text-text-muted text-3xs font-mono uppercase tracking-widest">
          No signal
        </div>
      ) : (
        <AgentSidePanelContent agentId={selectedAgentId} activeTab={activeTab} />
      )}
    </div>
  );
}

/** Inner content - separated so hooks are only called when an agent is selected. */
function AgentSidePanelContent({ agentId, activeTab }: AgentSidePanelContentProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col animate-fade-in">
      {activeTab === SIDE_PANEL_TAB.STATUS && <StatusTab agentId={agentId} />}
      {activeTab === SIDE_PANEL_TAB.ARTIFACTS && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <AgentArtifactsTab agentId={agentId} />
        </div>
      )}
      {activeTab === SIDE_PANEL_TAB.CIRCLE_ARTIFACTS && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <CircleArtifactsTab agentId={agentId} />
        </div>
      )}
    </div>
  );
}
