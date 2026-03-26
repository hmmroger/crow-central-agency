import type { JSX } from "react";
import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";
import { AgentConfigView } from "../agents/agent-config-view.js";
import { AgentConsole } from "../console/agent-console.js";

/**
 * App content — reads viewMode from app-store and renders the active view.
 * Pure view-switcher; each view owns its own data queries.
 */
export function AppContent() {
  const viewMode = useAppStore((state) => state.viewMode);
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const editorAgentId = useAppStore((state) => state.editorAgentId);

  let view: JSX.Element;
  switch (viewMode) {
    case VIEW_MODE.DASHBOARD:
      view = <Dashboard />;
      break;

    case VIEW_MODE.AGENTS:
      // Placeholder — will be replaced with AgentsView in Phase 4
      if (!selectedAgentId) {
        return (
          <main className="flex-1 overflow-hidden">
            <div className="h-full flex items-center justify-center text-text-muted">Select an agent</div>
          </main>
        );
      }

      view = <AgentConsole agentId={selectedAgentId} />;
      break;

    case VIEW_MODE.AGENT_EDITOR:
      view = <AgentConfigView agentId={editorAgentId} />;
      break;
  }

  return <main className="flex-1 overflow-hidden">{view}</main>;
}
