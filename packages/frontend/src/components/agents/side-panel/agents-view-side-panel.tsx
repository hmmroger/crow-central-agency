import { useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../../../stores/app-store.js";
import { TabBar } from "../../common/tab-bar.js";
import { SIDE_PANEL_TAB, SIDE_PANEL_TABS, type SidePanelTab } from "./side-panel-tabs.js";
import { SidePanelTabContent } from "./side-panel-tab-content.js";

/**
 * Side panel content for the Agents view.
 * TabBar with close action is always rendered; the body delegates to
 * SidePanelTabContent which handles the no-agent-selected empty state.
 */
export function AgentsViewSidePanel() {
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

      <div className="flex-1 min-h-0 flex flex-col animate-fade-in">
        <SidePanelTabContent tab={activeTab} />
      </div>
    </div>
  );
}
