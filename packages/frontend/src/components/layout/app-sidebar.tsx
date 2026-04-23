import { Bot, LayoutDashboard, ListTodo, Network, Settings } from "lucide-react";
import { useAppStore, VIEW_MODE, type ViewMode } from "../../stores/app-store.js";
import { cn } from "../../utils/cn.js";

/** Sidebar navigation items - icon + target view mode. Items with pinBottom render at the bottom. */
const SIDEBAR_ITEMS: { mode: ViewMode; icon: typeof LayoutDashboard; label: string; pinBottom?: boolean }[] = [
  { mode: VIEW_MODE.DASHBOARD, icon: LayoutDashboard, label: "Dashboard" },
  { mode: VIEW_MODE.AGENTS, icon: Bot, label: "Agents" },
  { mode: VIEW_MODE.TASKS, icon: ListTodo, label: "Tasks" },
  { mode: VIEW_MODE.GRAPH, icon: Network, label: "Circles Map" },
  { mode: VIEW_MODE.SETTINGS, icon: Settings, label: "Settings", pinBottom: true },
];

/**
 * Fixed icon sidebar - switches between views.
 * Items with pinBottom are visually separated at the bottom of the nav.
 */
export function AppSidebar() {
  const viewMode = useAppStore((state) => state.viewMode);
  const setViewMode = useAppStore((state) => state.setViewMode);

  return (
    <nav className="flex flex-col items-center gap-8 w-14 pt-10 shrink-0 border-r border-border-subtle/20 bg-surface">
      {SIDEBAR_ITEMS.map(({ mode, icon: Icon, label, pinBottom }) => {
        const isActive = viewMode === mode;

        return (
          <button
            key={mode}
            type="button"
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-md transition-colors",
              pinBottom && "mt-auto mb-10",
              isActive ? "text-primary bg-primary/20" : "text-text-muted hover:text-text-base hover:bg-surface-elevated"
            )}
            onClick={() => setViewMode(mode)}
            title={label}
          >
            <Icon className="h-6 w-6" />
          </button>
        );
      })}
    </nav>
  );
}
