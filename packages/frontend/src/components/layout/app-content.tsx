import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";
import { AgentConfigView } from "../agents/agent-config-view.js";
import { AgentConsole } from "../console/agent-console.js";
import { useAgents } from "../../hooks/use-agents.js";

/**
 * App content — reads viewMode from app-store and renders the active view.
 * View-state-based navigation, no URL router.
 * useAgents is hoisted here so console and dashboard share one fetch/WS listener.
 */
export function AppContent() {
  const viewMode = useAppStore((state) => state.viewMode);
  const activeAgentId = useAppStore((state) => state.activeAgentId);
  const { agents, loading, error, refetch } = useAgents();

  switch (viewMode) {
    case VIEW_MODE.DASHBOARD:
      return (
        <main className="flex-1 overflow-hidden">
          <Dashboard agents={agents} loading={loading} error={error} refetch={refetch} />
        </main>
      );

    case VIEW_MODE.CONSOLE: {
      const agent = activeAgentId ? agents.find((agentItem) => agentItem.id === activeAgentId) : undefined;

      if (!activeAgentId || !agent) {
        return (
          <main className="flex-1 overflow-hidden">
            <div className="h-full flex items-center justify-center text-text-muted">
              {loading ? "Loading..." : "No agent selected"}
            </div>
          </main>
        );
      }

      return (
        <main className="flex-1 overflow-hidden">
          <AgentConsole agent={agent} />
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
