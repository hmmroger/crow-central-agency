import { useCallback, useMemo, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { PERMISSION_MODE, type PermissionMode } from "@crow-central-agency/shared";
import { useContextMenu } from "../../providers/context-menu-provider.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { cn } from "../../utils/cn.js";

const PERMISSION_MODE_OPTIONS: { value: PermissionMode; label: string }[] = [
  { value: PERMISSION_MODE.DEFAULT, label: "Default" },
  { value: PERMISSION_MODE.ACCEPT_EDITS, label: "Accept Edits" },
  { value: PERMISSION_MODE.PLAN, label: "Plan" },
  { value: PERMISSION_MODE.DONT_ASK, label: "Don't Ask" },
  { value: PERMISSION_MODE.BYPASS_PERMISSIONS, label: "Bypass Permissions" },
];

interface PermissionModeSelectorProps {
  value: PermissionMode;
  onChange: (value: PermissionMode) => void;
  menuId: string;
  buttonId?: string;
}

/**
 * Permission mode selector using the context menu system
 * as a dropdown replacement for native <select>.
 */
export function PermissionModeSelector({ value, onChange, menuId, buttonId }: PermissionModeSelectorProps) {
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const isOpen = isMenuOpen(menuId);
  const selectedOption = PERMISSION_MODE_OPTIONS.find((option) => option.value === value);

  const menuItems = useMemo<ContextMenuItem[]>(
    () =>
      PERMISSION_MODE_OPTIONS.map((option) => ({
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
      id={buttonId}
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
