import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { Dashboard } from "../dashboard/dashboard.js";

/**
 * App content — reads viewMode from app-store and renders the active view.
 * View-state-based navigation, no URL router.
 */
export function AppContent() {
  const viewMode = useAppStore((state) => state.viewMode);

  switch (viewMode) {
    case VIEW_MODE.DASHBOARD:
      return (
        <main className="flex-1 overflow-hidden">
          <Dashboard />
        </main>
      );

    case VIEW_MODE.CONSOLE:
      // Phase 2 will add AgentConsole
      return (
        <main className="flex-1 overflow-hidden">
          <div className="h-full flex items-center justify-center text-text-muted">Console — coming in Phase 2</div>
        </main>
      );

    case VIEW_MODE.AGENT_EDITOR:
      // Task 1.6d will add AgentConfigView
      return (
        <main className="flex-1 overflow-hidden">
          <div className="h-full flex items-center justify-center text-text-muted">Agent Editor — coming next</div>
        </main>
      );

    default: {
      const _exhaustive: never = viewMode;

      return _exhaustive;
    }
  }
}
