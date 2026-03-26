import { Bot, LayoutDashboard } from "lucide-react";
import { useAppStore, VIEW_MODE, type ViewMode } from "../../stores/app-store.js";

/** Sidebar navigation items — icon + target view mode */
const SIDEBAR_ITEMS: { mode: ViewMode; icon: typeof LayoutDashboard; label: string }[] = [
  { mode: VIEW_MODE.DASHBOARD, icon: LayoutDashboard, label: "Dashboard" },
  { mode: VIEW_MODE.AGENTS, icon: Bot, label: "Agents" },
];

/**
 * Fixed icon sidebar — switches between Dashboard and Agents views.
 * AGENT_EDITOR mode: neither icon is highlighted.
 */
export function AppSidebar() {
  const viewMode = useAppStore((state) => state.viewMode);
  const setViewMode = useAppStore((state) => state.setViewMode);

  return (
    <nav className="flex flex-col items-center gap-1 w-12 pt-3 shrink-0 border-r border-border-subtle bg-surface">
      {SIDEBAR_ITEMS.map(({ mode, icon: Icon, label }) => {
        const isActive = viewMode === mode;

        return (
          <button
            key={mode}
            type="button"
            className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
              isActive
                ? "text-primary bg-primary/10"
                : "text-text-muted hover:text-text-primary hover:bg-surface-elevated"
            }`}
            onClick={() => setViewMode(mode)}
            title={label}
          >
            <Icon className="h-5 w-5" />
          </button>
        );
      })}
    </nav>
  );
}
