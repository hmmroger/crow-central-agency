import { useAppStore } from "../../stores/app-store.js";
import { cn } from "../../utils/cn.js";
import { APP_NAV_ITEMS } from "./app-nav-items.js";

/**
 * Fixed icon sidebar - switches between views.
 * Items with pinBottom are visually separated at the bottom of the nav.
 * Hidden below the md breakpoint; on mobile, the AppHeader logo opens the same nav menu.
 */
export function AppSidebar() {
  const viewMode = useAppStore((state) => state.viewMode);
  const setViewMode = useAppStore((state) => state.setViewMode);

  return (
    <nav className="hidden md:flex flex-col items-center gap-8 w-14 pt-10 shrink-0 border-r border-border-subtle/20 bg-surface">
      {APP_NAV_ITEMS.map(({ mode, icon: Icon, label, pinBottom }) => {
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
