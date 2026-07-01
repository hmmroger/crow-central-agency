import { useCallback, useMemo, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { THINKING_MODE, type ThinkingMode } from "@crow-central-agency/shared";
import { useContextMenu } from "../../providers/context-menu-provider.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { cn } from "../../utils/cn.js";

interface ThinkingSelectorProps {
  value: ThinkingMode | undefined;
  supportsAdaptiveThinking: boolean;
  onChange: (value: ThinkingMode | undefined) => void;
  menuId: string;
}

/** Label for the unset thinking mode, which leaves the provider default in place. */
const DEFAULT_THINKING_LABEL = "Default";

/** Display labels per thinking mode; exhaustive so a new mode forces an explicit label. */
const THINKING_LABELS: Record<ThinkingMode, string> = {
  [THINKING_MODE.ENABLED]: "Enabled",
  [THINKING_MODE.DISABLED]: "Disabled",
  [THINKING_MODE.ADAPTIVE]: "Adaptive",
};

/**
 * Extended-thinking selector using the context menu system as a dropdown
 * replacement for native <select>. Always offers a "Default" entry that clears
 * the mode; when unset, the button shows the model's natural default (Adaptive
 * for adaptive-capable models, otherwise Enabled).
 */
export function ThinkingSelector({ value, supportsAdaptiveThinking, onChange, menuId }: ThinkingSelectorProps) {
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const isOpen = isMenuOpen(menuId);

  // An unset mode resolves to the model's natural default, matching the Claude runner's behavior.
  const resolvedDefaultLabel = supportsAdaptiveThinking
    ? THINKING_LABELS[THINKING_MODE.ADAPTIVE]
    : THINKING_LABELS[THINKING_MODE.ENABLED];

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    const items: ContextMenuItem[] = [
      {
        type: ContextMenuTypes.action,
        label: DEFAULT_THINKING_LABEL,
        onClick: () => onChange(undefined),
        selected: value === undefined,
      },
    ];

    // Adaptive-capable models offer Adaptive (not Enabled); the two are mutually exclusive per model.
    if (supportsAdaptiveThinking) {
      items.push({
        type: ContextMenuTypes.action,
        label: THINKING_LABELS[THINKING_MODE.ADAPTIVE],
        onClick: () => onChange(THINKING_MODE.ADAPTIVE),
        selected: value === THINKING_MODE.ADAPTIVE,
      });
    } else {
      items.push({
        type: ContextMenuTypes.action,
        label: THINKING_LABELS[THINKING_MODE.ENABLED],
        onClick: () => onChange(THINKING_MODE.ENABLED),
        selected: value === THINKING_MODE.ENABLED,
      });
    }

    items.push({
      type: ContextMenuTypes.action,
      label: THINKING_LABELS[THINKING_MODE.DISABLED],
      onClick: () => onChange(THINKING_MODE.DISABLED),
      selected: value === THINKING_MODE.DISABLED,
    });

    return items;
  }, [supportsAdaptiveThinking, onChange, value]);

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
      <span className="flex-1 truncate text-text-base">{value ? THINKING_LABELS[value] : resolvedDefaultLabel}</span>
      <ChevronDown
        className={cn("h-3.5 w-3.5 shrink-0 text-text-muted transition-transform", isOpen && "rotate-180")}
      />
    </button>
  );
}
