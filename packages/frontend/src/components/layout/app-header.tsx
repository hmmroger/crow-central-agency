import { useCallback, useMemo, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { CrowIcon } from "../common/icons/crow.js";
import { useHeader } from "../../hooks/use-header.js";
import { useContextMenu } from "../../providers/context-menu-provider.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { useAppStore } from "../../stores/app-store.js";
import { cn } from "../../utils/cn.js";
import { APP_NAV_ITEMS } from "./app-nav-items.js";
import { ConnectionStatus } from "./connection-status.js";

const LOGO_NAV_MENU_ID = "header-logo-nav";

/**
 * Top bar - logo + title (set by views via HeaderPortal).
 * Below the md breakpoint the sidebar is hidden, so the logo doubles as a nav menu trigger.
 * When a view registers a header dropdown, a chevron button is rendered after the title.
 */
export function AppHeader() {
  const { title, dropdown } = useHeader();
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const viewMode = useAppStore((state) => state.viewMode);
  const setViewMode = useAppStore((state) => state.setViewMode);
  const isDropdownOpen = dropdown ? isMenuOpen(dropdown.menuId) : false;
  const isLogoMenuOpen = isMenuOpen(LOGO_NAV_MENU_ID);

  const logoMenuItems = useMemo<ContextMenuItem[]>(() => {
    const items: ContextMenuItem[] = [];

    APP_NAV_ITEMS.forEach((item, index) => {
      const previous = APP_NAV_ITEMS[index - 1];
      if (item.pinBottom && previous && !previous.pinBottom) {
        items.push({ type: ContextMenuTypes.separator });
      }

      items.push({
        type: ContextMenuTypes.action,
        label: item.label,
        icon: item.icon,
        onClick: () => setViewMode(item.mode),
        selected: viewMode === item.mode,
      });
    });

    return items;
  }, [setViewMode, viewMode]);

  const handleLogoClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      toggleMenu({
        id: LOGO_NAV_MENU_ID,
        anchorRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        items: logoMenuItems,
        placement: "bottom-start",
      });
    },
    [logoMenuItems, toggleMenu]
  );

  const handleDropdownClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!dropdown) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      toggleMenu({
        id: dropdown.menuId,
        anchorRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        items: dropdown.items,
        placement: "bottom-start",
      });
    },
    [dropdown, toggleMenu]
  );

  return (
    <header className="flex items-center h-12 px-4 border-b border-border-subtle/20 bg-surface/80 backdrop-blur-sm shrink-0">
      {/* Mobile: logo doubles as nav menu trigger (sidebar is hidden below md) */}
      <button
        type="button"
        className={cn(
          "md:hidden flex items-center shrink-0 font-mono gap-2 -mx-1 px-1 py-1 rounded-md transition-colors",
          isLogoMenuOpen ? "bg-surface-hover" : "hover:bg-surface-hover"
        )}
        onClick={handleLogoClick}
        aria-haspopup="menu"
        aria-expanded={isLogoMenuOpen}
        aria-label="Open navigation menu"
      >
        <CrowIcon className="h-5 w-5 text-primary" size={20} />
        <div className="flex flex-col text-sm font-semibold tracking-tight text-text-base">
          <span className="leading-none">cr</span>
          <span className="leading-none">ow</span>
        </div>
      </button>

      {/* Desktop: decorative logo (sidebar handles navigation) */}
      <div className="hidden md:flex items-center shrink-0 font-mono gap-2">
        <CrowIcon className="h-5 w-5 text-primary" size={20} />
        <div className="flex flex-col text-sm font-semibold tracking-tight text-text-base">
          <span className="leading-none">cr</span>
          <span className="leading-none">ow</span>
        </div>
      </div>

      <div className="h-5 w-px bg-border-subtle mx-5 shrink-0" />

      {/* Title + optional dropdown - set by views via HeaderPortal */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {title && <span className="text-sm font-medium text-text-base truncate">{title}</span>}
        {dropdown && (
          <button
            type="button"
            className={cn(
              "shrink-0 inline-flex items-center justify-center rounded-md h-6 w-6 transition-colors",
              isDropdownOpen
                ? "text-text-base bg-surface-hover"
                : "text-text-muted hover:text-text-base hover:border-border"
            )}
            onClick={handleDropdownClick}
            aria-haspopup="menu"
            aria-expanded={isDropdownOpen}
            aria-label="Open header menu"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isDropdownOpen && "rotate-180")} />
          </button>
        )}
      </div>

      <ConnectionStatus />
    </header>
  );
}
