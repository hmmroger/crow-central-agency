import { useCallback, useMemo, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { AGENT_TYPE, resolveModel, type AgentType } from "@crow-central-agency/shared";
import { useSystemCapabilitiesQuery } from "../../hooks/queries/use-system-capabilities-query.js";
import { useContextMenu } from "../../providers/context-menu-provider.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { cn } from "../../utils/cn.js";

interface ModelSelectorProps {
  value: string;
  agentType: AgentType;
  onChange: (value: string) => void;
  menuId: string;
  buttonId?: string;
}

/**
 * Model selector using the context menu system
 * as a dropdown replacement for native <select>.
 */
export function ModelSelector({ value, agentType, onChange, menuId, buttonId }: ModelSelectorProps) {
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const { data: capabilities } = useSystemCapabilitiesQuery();
  const isOpen = isMenuOpen(menuId);
  const resolvedValue = resolveModel(value);
  const options = useMemo(
    () =>
      agentType === AGENT_TYPE.GITHUB_COPILOT
        ? (capabilities?.copilotSupportedModels ?? [])
        : (capabilities?.claudeSupportedModels ?? []),
    [agentType, capabilities]
  );
  const selectedOption = options.find((option) => option.value === resolvedValue);

  const menuItems = useMemo<ContextMenuItem[]>(
    () =>
      options.map((option) => ({
        type: ContextMenuTypes.action,
        label: option.label,
        onClick: () => onChange(option.value),
        selected: option.value === resolvedValue,
      })),
    [options, onChange, resolvedValue]
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
