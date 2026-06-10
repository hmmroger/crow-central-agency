import { useCallback, useMemo, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { AGENT_TYPE, PERMISSION_MODE, type AgentType, type PermissionMode } from "@crow-central-agency/shared";
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

// Copilot has no preset accept-edits equivalent, and its plan-mode exit isn't wired yet, so neither
// is offered for Copilot agents.
const COPILOT_UNSUPPORTED_MODES = new Set<PermissionMode>([PERMISSION_MODE.ACCEPT_EDITS, PERMISSION_MODE.PLAN]);

interface PermissionModeSelectorProps {
  value: PermissionMode;
  agentType: AgentType;
  onChange: (value: PermissionMode) => void;
  menuId: string;
  buttonId?: string;
}

/**
 * Permission mode selector using the context menu system
 * as a dropdown replacement for native <select>.
 */
export function PermissionModeSelector({ value, agentType, onChange, menuId, buttonId }: PermissionModeSelectorProps) {
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const isOpen = isMenuOpen(menuId);
  const options = useMemo(
    () =>
      agentType === AGENT_TYPE.GITHUB_COPILOT
        ? PERMISSION_MODE_OPTIONS.filter((option) => !COPILOT_UNSUPPORTED_MODES.has(option.value))
        : PERMISSION_MODE_OPTIONS,
    [agentType]
  );
  const selectedOption = options.find((option) => option.value === value);

  const menuItems = useMemo<ContextMenuItem[]>(
    () =>
      options.map((option) => ({
        type: ContextMenuTypes.action,
        label: option.label,
        onClick: () => onChange(option.value),
        selected: option.value === value,
      })),
    [options, onChange, value]
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
