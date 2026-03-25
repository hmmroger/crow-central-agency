import { AnimatePresence, motion } from "framer-motion";
import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";
import { AgentConfigView } from "../agents/agent-config-view.js";
import { AgentConsole } from "../console/agent-console.js";

/** Matches CSS --duration-slow (300ms) */
const VIEW_TRANSITION_DURATION = 0.3;

/** Matches CSS --ease-out: cubic-bezier(0.16, 1, 0.3, 1) */
const VIEW_TRANSITION_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * App content — reads currentView from app-store and renders the active view.
 * Pure view-switcher; each view owns its own data queries.
 * AnimatePresence provides crossfade transitions between views.
 */
export function AppContent() {
  const currentView = useAppStore((state) => state.currentView);

  /** Compound key so switching agents within the console also triggers a transition */
  const viewKey =
    currentView.viewMode === VIEW_MODE.CONSOLE
      ? `${currentView.viewMode}-${currentView.activeAgentId ?? ""}`
      : currentView.viewMode;

  const renderView = () => {
    switch (currentView.viewMode) {
      case VIEW_MODE.DASHBOARD:
        return <Dashboard />;

      case VIEW_MODE.CONSOLE:
        if (!currentView.activeAgentId) {
          return <div className="h-full flex items-center justify-center text-text-muted">No agent selected</div>;
        }

        return <AgentConsole agentId={currentView.activeAgentId} />;

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
        transition={{ duration: VIEW_TRANSITION_DURATION, ease: VIEW_TRANSITION_EASE }}
        className="flex-1 overflow-hidden"
      >
        {renderView()}
      </motion.main>
    </AnimatePresence>
  );
}
