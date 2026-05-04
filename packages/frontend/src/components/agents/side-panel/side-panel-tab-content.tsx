import { useAppStore } from "../../../stores/app-store.js";
import { SIDE_PANEL_TAB, type SidePanelTab } from "./side-panel-tabs.js";
import { StatusTab } from "./status-tab.js";
import { AgentArtifactsTab } from "./agent-artifacts-tab.js";
import { CircleArtifactsTab } from "./circle-artifacts-tab.js";

interface SidePanelTabContentProps {
  tab: SidePanelTab;
}

/**
 * Renders the body of a single side-panel tab, sourcing the agent id from the
 * app store. Shared between the desktop side panel (where the body sits below
 * a TabBar) and the narrow-screen FullPanel takeover (where each tab is opened
 * individually from a header action).
 */
export function SidePanelTabContent({ tab }: SidePanelTabContentProps) {
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);

  if (!selectedAgentId) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-3xs font-mono uppercase tracking-widest">
        No signal
      </div>
    );
  }

  if (tab === SIDE_PANEL_TAB.STATUS) {
    return <StatusTab agentId={selectedAgentId} />;
  }

  if (tab === SIDE_PANEL_TAB.ARTIFACTS) {
    return (
      <div className="h-full overflow-hidden">
        <AgentArtifactsTab agentId={selectedAgentId} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <CircleArtifactsTab agentId={selectedAgentId} />
    </div>
  );
}
