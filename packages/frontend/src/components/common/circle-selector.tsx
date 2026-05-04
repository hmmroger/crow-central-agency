import { useCallback, useMemo, type MouseEvent } from "react";
import { ChevronDown, CircleDot } from "lucide-react";
import type { AgentCircle } from "@crow-central-agency/shared";
import { useContextMenu } from "../../providers/context-menu-provider.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { cn } from "../../utils/cn.js";

interface CircleSelectorProps {
  /** Available circles to choose from */
  circles: AgentCircle[];
  /** Currently selected circle ID, or empty string */
  value: string;
  /** Called when the user selects or clears */
  onChange: (value: string) => void;
  /** Placeholder text when nothing is selected */
  placeholder?: string;
  /** Unique menu ID for toggle support — must be unique per instance on the page */
  menuId: string;
}

/**
 * Circle selector trigger button that opens a context menu with circle options.
 * Replaces native `<select>` with a styled dropdown using the context menu system.
 */
export function CircleSelector({
  circles,
  value,
  onChange,
  placeholder = "Select a circle",
  menuId,
}: CircleSelectorProps) {
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const isOpen = isMenuOpen(menuId);
  const selectedCircle = circles.find((circle) => circle.id === value);

  const menuItems = useMemo<ContextMenuItem[]>(
    () =>
      circles.map((circle) => ({
        type: ContextMenuTypes.action,
        label: circle.name,
        icon: CircleDot,
        onClick: () => onChange(circle.id),
        selected: circle.id === value,
      })),
    [circles, onChange, value]
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      toggleMenu({
        id: menuId,
        anchorRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        items: menuItems,
        placement: "bottom-start",
        style: { minWidth: `${rect.width}px` },
      });
    },
    [toggleMenu, menuId, menuItems]
  );

  return (
    <button
      type="button"
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left",
        "bg-surface-inset border transition-colors cursor-pointer",
        isOpen ? "border-border-focus" : "border-border-subtle"
      )}
      onClick={handleClick}
      aria-haspopup="menu"
      aria-expanded={isOpen}
    >
      {selectedCircle ? (
        <>
          <CircleDot className="h-3.5 w-3.5 shrink-0 text-text-neutral" />
          <span className="flex-1 truncate text-text-base">{selectedCircle.name}</span>
        </>
      ) : (
        <span className="flex-1 truncate text-text-muted">{placeholder}</span>
      )}
      <ChevronDown
        className={cn("h-3.5 w-3.5 shrink-0 text-text-muted transition-transform", isOpen && "rotate-180")}
      />
    </button>
  );
}
