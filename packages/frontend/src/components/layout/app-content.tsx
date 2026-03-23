import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";
import { AgentConfigView } from "../agents/agent-config-view.js";
import { AgentConsole } from "../console/agent-console.js";
import { useAgents } from "../../hooks/use-agents.js";

/**
 * App content — reads viewMode from app-store and renders the active view.
 * View-state-based navigation, no URL router.
 */
export function AppContent() {
  const viewMode = useAppStore((state) => state.viewMode);
  const activeAgentId = useAppStore((state) => state.activeAgentId);

  switch (viewMode) {
    case VIEW_MODE.DASHBOARD:
      return (
        <main className="flex-1 overflow-hidden">
          <Dashboard />
        </main>
      );

    case VIEW_MODE.CONSOLE: {
      if (!activeAgentId) {
        return (
          <main className="flex-1 overflow-hidden">
            <div className="h-full flex items-center justify-center text-text-muted">No agent selected</div>
          </main>
        );
      }

      return (
        <main className="flex-1 overflow-hidden">
          <ConsoleView agentId={activeAgentId} />
        </main>
      );
    }

    case VIEW_MODE.AGENT_EDITOR:
      return (
        <main className="flex-1 overflow-hidden">
          <AgentConfigView agentId={activeAgentId} />
        </main>
      );

    default: {
      const _exhaustive: never = viewMode;

      return _exhaustive;
    }
  }
}

/** Wrapper that fetches agent config and renders the console */
function ConsoleView({ agentId }: { agentId: string }) {
  const { agents } = useAgents();
  const agent = agents.find((agentItem) => agentItem.id === agentId);

  if (!agent) {
    return <div className="h-full flex items-center justify-center text-text-muted">Agent not found</div>;
  }

  return <AgentConsole agent={agent} />;
}
