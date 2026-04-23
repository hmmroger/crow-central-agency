import { useCallback, useMemo, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { MCP_CONFIG_TYPE, type McpConfigType } from "@crow-central-agency/shared";
import { useContextMenu } from "../../providers/context-menu-provider.js";
import type { ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { cn } from "../../utils/cn.js";

const TYPE_OPTIONS: { value: McpConfigType; label: string }[] = [
  { value: MCP_CONFIG_TYPE.STDIO, label: "Local (stdio)" },
  { value: MCP_CONFIG_TYPE.SSE, label: "Remote (SSE)" },
  { value: MCP_CONFIG_TYPE.HTTP, label: "Remote (HTTP)" },
];

interface McpTypeSelectorProps {
  value: McpConfigType;
  onChange: (value: McpConfigType) => void;
  menuId: string;
}

/**
 * MCP config type selector using the context menu system
 * as a dropdown replacement for native <select>.
 */
export function McpTypeSelector({ value, onChange, menuId }: McpTypeSelectorProps) {
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const isOpen = isMenuOpen(menuId);
  const selectedOption = TYPE_OPTIONS.find((option) => option.value === value);

  const menuItems = useMemo<ContextMenuItem[]>(
    () =>
      TYPE_OPTIONS.map((option) => ({
        type: "action",
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
