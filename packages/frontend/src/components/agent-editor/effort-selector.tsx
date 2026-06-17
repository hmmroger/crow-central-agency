import { useCallback, useMemo, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import type { ReasoningEffort } from "@crow-central-agency/shared";
import { useContextMenu } from "../../providers/context-menu-provider.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { cn } from "../../utils/cn.js";

interface EffortSelectorProps {
  value: ReasoningEffort | undefined;
  supportedEfforts: ReasoningEffort[];
  onChange: (value: ReasoningEffort | undefined) => void;
  menuId: string;
}

/** Label for the unset effort, which leaves the provider's adaptive default in place. */
const DEFAULT_EFFORT_LABEL = "Default";

/** Capitalize the effort level for display (e.g. "high" -> "High"). */
function formatEffortLabel(effort: ReasoningEffort): string {
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

/**
 * Reasoning effort selector using the context menu system as a dropdown
 * replacement for native <select>. Always offers a "Default" entry that clears
 * the effort, followed by the levels the selected model supports.
 */
export function EffortSelector({ value, supportedEfforts, onChange, menuId }: EffortSelectorProps) {
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const isOpen = isMenuOpen(menuId);

  const menuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        type: ContextMenuTypes.action,
        label: DEFAULT_EFFORT_LABEL,
        onClick: () => onChange(undefined),
        selected: value === undefined,
      },
      ...supportedEfforts.map((effort) => ({
        type: ContextMenuTypes.action,
        label: formatEffortLabel(effort),
        onClick: () => onChange(effort),
        selected: value === effort,
      })),
    ],
    [supportedEfforts, onChange, value]
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
      <span className="flex-1 truncate text-text-base">{value ? formatEffortLabel(value) : DEFAULT_EFFORT_LABEL}</span>
      <ChevronDown
        className={cn("h-3.5 w-3.5 shrink-0 text-text-muted transition-transform", isOpen && "rotate-180")}
      />
    </button>
  );
}
