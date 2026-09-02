import type { JSX } from "react";
import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";
import { AgentsView } from "../agents/agents-view.js";
import { AgentBuilderView } from "../agent-builder/agent-builder-view.js";
import { TasksView } from "../tasks/tasks-view.js";
import { SchedulesView } from "../schedules/schedules-view.js";
import { SettingsView } from "../settings/settings-view.js";
import { GraphView } from "../graph/graph-view.js";
import { useConnectorCallbackHandler } from "../../hooks/use-connector-callback-handler.js";

/**
 * App content - reads viewMode from app-store and renders the active view.
 * Pure view-switcher; each view owns its own data queries.
 * Agent editor is rendered as a modal dialog (see useOpenAgentEditor hook).
 */
export function AppContent() {
  const viewMode = useAppStore((state) => state.viewMode);
  useConnectorCallbackHandler();

  let view: JSX.Element;
  switch (viewMode) {
    case VIEW_MODE.DASHBOARD:
      view = <Dashboard />;
      break;

    case VIEW_MODE.AGENTS:
      view = <AgentsView />;
      break;

    case VIEW_MODE.AGENT_BUILDER:
      view = <AgentBuilderView />;
      break;

    case VIEW_MODE.TASKS:
      view = <TasksView />;
      break;

    case VIEW_MODE.SCHEDULES:
      view = <SchedulesView />;
      break;

    case VIEW_MODE.GRAPH:
      view = <GraphView />;
      break;

    case VIEW_MODE.SETTINGS:
      view = <SettingsView />;
      break;
  }

  return <main className="flex-1 overflow-hidden">{view}</main>;
}
