import type { ComponentType, MouseEvent } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useContextMenu } from "../../providers/context-menu-provider";
import { ActionButton, type ActionButtonVariant } from "./action-button.js";

export interface TabDefinition<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Floating menu ID; when provided with onDropdownClick, renders a dropdown chevron */
  menuId?: string;
  /** Handler for the dropdown chevron click */
  onDropdownClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

/** A button right-aligned in the tab row */
export interface TabBarAction {
  id: string;
  /** Visible text, or the tooltip and accessible name when `iconOnly` */
  label: string;
  icon?: ComponentType<{ className?: string }>;
  variant?: ActionButtonVariant;
  iconOnly?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface TabBarProps<T extends string> {
  tabs: TabDefinition<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  /** Unique layoutId prefix to avoid collisions when multiple TabBars exist */
  layoutId?: string;
  actions?: TabBarAction[];
}

export function TabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  layoutId = "tabBar",
  actions,
}: TabBarProps<T>) {
  const { isMenuOpen } = useContextMenu();

  const textStyle = "flex items-center gap-1 px-1.5 py-0.5 text-sm font-medium transition-colors";
  const activeText = "text-text-base";
  const inactiveText = "text-text-muted hover:text-text-neutral";

  const indicator = (
    <motion.div
      className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-accent-primary to-accent-hover"
      layoutId={`${layoutId}-indicator`}
      initial={false}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    />
  );

  return (
    <div className="mb-1.5 flex items-center gap-1 px-1">
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const hasDropdown = Boolean(tab.menuId) && Boolean(tab.onDropdownClick);
        const isSplit = hasDropdown;
        const dropdownOpen = tab.menuId ? isMenuOpen(tab.menuId) : false;

        return (
          <div key={tab.id} className="flex items-center gap-1">
            {index > 0 && <div className="h-3 border-l border-border" />}

            {isSplit ? (
              <div className={`relative flex items-center rounded`}>
                {/* Main tab button */}
                <button
                  type="button"
                  className={`${textStyle} rounded-l ${isActive ? activeText : inactiveText}`}
                  onClick={() => onTabChange(tab.id)}
                  title={tab.label}
                  aria-label={tab.label}
                >
                  <Icon className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">{tab.label}</span>
                </button>

                {tab.menuId && tab.onDropdownClick && (
                  <>
                    <div className={`h-3 w-px ${isActive ? "bg-accent-primary/30" : "bg-border"}`} />
                    <button
                      type="button"
                      className={`rounded-r px-1 py-0.5 transition-colors ${isActive ? activeText : inactiveText}`}
                      onClick={tab.onDropdownClick}
                      aria-haspopup="menu"
                      aria-expanded={dropdownOpen}
                      aria-label={`${tab.label} options`}
                    >
                      <ChevronDown className={`h-2.5 w-2.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                    </button>
                  </>
                )}

                {isActive && indicator}
              </div>
            ) : (
              <button
                type="button"
                className={`relative ${textStyle} rounded ${isActive ? `${activeText}` : inactiveText}`}
                onClick={() => onTabChange(tab.id)}
                title={tab.label}
                aria-label={tab.label}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only">{tab.label}</span>
                {isActive && indicator}
              </button>
            )}
          </div>
        );
      })}

      {actions && actions.length > 0 && (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions.map((action) => (
            <ActionButton
              key={action.id}
              icon={action.icon}
              label={action.label}
              variant={action.variant}
              iconOnly={action.iconOnly}
              disabled={action.disabled}
              onClick={action.onClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
