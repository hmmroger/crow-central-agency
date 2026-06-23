import { useCallback, useMemo, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { AGENT_TYPE, type AgentType } from "@crow-central-agency/shared";
import { useContextMenu } from "../../providers/context-menu-provider.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { cn } from "../../utils/cn.js";

const AGENT_TYPE_OPTIONS: { value: AgentType; label: string }[] = [
  { value: AGENT_TYPE.CLAUDE_CODE, label: "Claude Code" },
  { value: AGENT_TYPE.GITHUB_COPILOT, label: "GitHub Copilot" },
];

interface AgentTypeSelectorProps {
  value: AgentType;
  onChange: (value: AgentType) => void;
  menuId: string;
}

/**
 * Agent-type selector using the context menu system, mirroring PermissionModeSelector. Applied to the
 * whole fleet at build time.
 */
export function AgentTypeSelector({ value, onChange, menuId }: AgentTypeSelectorProps) {
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const isOpen = isMenuOpen(menuId);
  const selectedOption = AGENT_TYPE_OPTIONS.find((option) => option.value === value);

  const menuItems = useMemo<ContextMenuItem[]>(
    () =>
      AGENT_TYPE_OPTIONS.map((option) => ({
        type: ContextMenuTypes.action,
        label: option.label,
        onClick: () => onChange(option.value),
        selected: option.value === value,
      })),
    [onChange, value]
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
      <span className="flex-1 truncate text-text-base">{selectedOption?.label ?? value}</span>
      <ChevronDown
        className={cn("h-3.5 w-3.5 shrink-0 text-text-muted transition-transform", isOpen && "rotate-180")}
      />
    </button>
  );
}
