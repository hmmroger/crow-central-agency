import type { JSX } from "react";
import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";
import { AgentEditorView } from "../agent-editor/agent-editor-view.js";
import { AgentsView } from "../agents/agents-view.js";

/**
 * App content — reads viewMode from app-store and renders the active view.
 * Pure view-switcher; each view owns its own data queries.
 */
export function AppContent() {
  const viewMode = useAppStore((state) => state.viewMode);
  const editorAgentId = useAppStore((state) => state.editorAgentId);

  let view: JSX.Element;
  switch (viewMode) {
    case VIEW_MODE.DASHBOARD:
      view = <Dashboard />;
      break;

    case VIEW_MODE.AGENTS:
      view = <AgentsView />;
      break;

    case VIEW_MODE.AGENT_EDITOR:
      view = <AgentEditorView agentId={editorAgentId} />;
      break;
  }

  return <main className="flex-1 overflow-hidden">{view}</main>;
}
