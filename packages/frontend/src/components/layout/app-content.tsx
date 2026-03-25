import { useCallback } from "react";
import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";
import { AgentConfigView } from "../agents/agent-config-view.js";
import { AgentConsole } from "../console/agent-console.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";

/**
 * App content — reads currentView from app-store and renders the active view.
 * View-state-based navigation, no URL router.
 * useAgentsQuery is hoisted here so console and dashboard share one query/WS listener.
 */
export function AppContent() {
  const currentView = useAppStore((state) => state.currentView);
  const { data: agents = [], isLoading: loading, error, refetch } = useAgentsQuery();
  const handleRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  switch (currentView.viewMode) {
    case VIEW_MODE.DASHBOARD:
      return (
        <main className="flex-1 overflow-hidden">
          <Dashboard agents={agents} loading={loading} error={error?.message} refetch={handleRefetch} />
        </main>
      );

    case VIEW_MODE.CONSOLE: {
      const agent = currentView.activeAgentId
        ? agents.find((agentItem) => agentItem.id === currentView.activeAgentId)
        : undefined;

      if (!currentView.activeAgentId || !agent) {
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
          <AgentConfigView agentId={currentView.activeAgentId} />
        </main>
      );

    default: {
      const _exhaustive: never = currentView.viewMode;

      return _exhaustive;
    }
  }
}
