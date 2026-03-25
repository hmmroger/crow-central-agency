import { useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";
import { AgentConfigView } from "../agents/agent-config-view.js";
import { AgentConsole } from "../console/agent-console.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { DURATION, EASING } from "../../utils/animation-tokens.js";

/**
 * App content — reads currentView from app-store and renders the active view.
 * View-state-based navigation, no URL router.
 * useAgentsQuery is hoisted here so console and dashboard share one query/WS listener.
 * AnimatePresence provides crossfade transitions between views.
 */
export function AppContent() {
  const currentView = useAppStore((state) => state.currentView);
  const { data: agents = [], isLoading: loading, error, refetch } = useAgentsQuery();
  const handleRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  /** Resolve the view key — used for AnimatePresence keying */
  const viewKey =
    currentView.viewMode === VIEW_MODE.CONSOLE
      ? `${currentView.viewMode}-${currentView.activeAgentId ?? ""}`
      : currentView.viewMode;

  const renderView = () => {
    switch (currentView.viewMode) {
      case VIEW_MODE.DASHBOARD:
        return <Dashboard agents={agents} loading={loading} error={error?.message} refetch={handleRefetch} />;

      case VIEW_MODE.CONSOLE: {
        const agent = currentView.activeAgentId
          ? agents.find((agentItem) => agentItem.id === currentView.activeAgentId)
          : undefined;

        if (!currentView.activeAgentId || !agent) {
          return (
            <div className="h-full flex items-center justify-center text-text-muted">
              {loading ? "Loading..." : "No agent selected"}
            </div>
          );
        }

        return <AgentConsole agent={agent} />;
      }

      case VIEW_MODE.AGENT_EDITOR:
        return <AgentConfigView agentId={currentView.activeAgentId} />;

      default: {
        const _exhaustive: never = currentView.viewMode;

        return _exhaustive;
      }
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.main
        key={viewKey}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: DURATION.SLOW, ease: EASING.OUT }}
        className="flex-1 overflow-hidden"
      >
        {renderView()}
      </motion.main>
    </AnimatePresence>
  );
}
