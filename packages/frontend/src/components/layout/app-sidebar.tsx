import { useGetNotification } from "../../providers/notifications-provider.js";
import { useAppStore } from "../../stores/app-store.js";
import { cn } from "../../utils/cn.js";
import { Badge } from "../common/badge.js";
import { APP_NAV_ITEMS } from "./app-nav-items.js";

/**
 * Fixed icon sidebar - switches between views.
 * Items with pinBottom are visually separated at the bottom of the nav.
 * Hidden below the md breakpoint; on mobile, the AppHeader logo opens the same nav menu.
 */
export function AppSidebar() {
  const viewMode = useAppStore((state) => state.viewMode);
  const setViewMode = useAppStore((state) => state.setViewMode);
  const getNotification = useGetNotification();

  const firstBottomIndex = APP_NAV_ITEMS.findIndex((item) => item.pinBottom);
  const lastBottomIndex = APP_NAV_ITEMS.reduce((last, item, index) => (item.pinBottom ? index : last), -1);

  return (
    <nav className="hidden md:flex flex-col items-center gap-8 w-14 pt-10 shrink-0 border-r border-border-subtle/20 bg-surface">
      {APP_NAV_ITEMS.map(({ mode, icon: Icon, label }, index) => {
        const isActive = viewMode === mode;
        const notification = getNotification(mode);
        const accessibleLabel = notification.description ? `${label} (${notification.description})` : label;

        return (
          <button
            key={mode}
            type="button"
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-md transition-colors",
              index === firstBottomIndex && "mt-auto",
              index === lastBottomIndex && "mb-10",
              isActive ? "text-primary bg-primary/20" : "text-text-muted hover:text-text-base hover:bg-surface-elevated"
            )}
            onClick={() => setViewMode(mode)}
            title={accessibleLabel}
            aria-label={accessibleLabel}
          >
            <span className="relative">
              <Icon className="h-6 w-6" />
              {notification.hasNotification && (
                <Badge count={notification.count} className="absolute -top-1.5 -right-2" />
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
