import type { JSX } from "react";
import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";
import { AgentConfigView } from "../agents/agent-config-view.js";
import { AgentConsole } from "../console/agent-console.js";

/**
 * App content — reads currentView from app-store and renders the active view.
 * Pure view-switcher; each view owns its own data queries.
 */
export function AppContent() {
  const currentView = useAppStore((state) => state.currentView);

  let view: JSX.Element;
  switch (currentView.viewMode) {
    case VIEW_MODE.DASHBOARD:
      view = <Dashboard />;
      break;

    case VIEW_MODE.CONSOLE:
      if (!currentView.activeAgentId) {
        return <div className="h-full flex items-center justify-center text-text-muted">No agent selected</div>;
      }

      view = <AgentConsole agentId={currentView.activeAgentId} />;
      break;

    case VIEW_MODE.AGENT_EDITOR:
      view = <AgentConfigView agentId={currentView.activeAgentId} />;
      break;

    default: {
      const _exhaustive: never = currentView.viewMode;

      return _exhaustive;
    }
  }

  return <main className="flex-1 overflow-hidden">{view}</main>;
}
