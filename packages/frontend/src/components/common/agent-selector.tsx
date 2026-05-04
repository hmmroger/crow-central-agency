import { useCallback, useMemo, type MouseEvent } from "react";
import { Bot, ChevronDown, User } from "lucide-react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { useContextMenu } from "../../providers/context-menu-provider.js";
import { ContextMenuTypes, type ContextMenuItem } from "../../providers/context-menu-provider.types.js";
import { cn } from "../../utils/cn.js";

/** Sentinel value representing user self-selection. Use this to check if "Myself" was chosen. */
export const USER_SELF_SELECTION = "__user__";

interface AgentSelectorProps {
  /** Available agents to choose from */
  agents: AgentConfig[];
  /** Currently selected value — agent ID, USER_SELF_SELECTION, or empty string */
  value: string;
  /** Called when the user selects or clears */
  onChange: (value: string) => void;
  /** Placeholder text when nothing is selected */
  placeholder?: string;
  /** Whether to show a "clear selection" option (defaults to true) */
  allowClear?: boolean;
  /** Whether to show a "Myself" option for user self-assignment */
  showUserOption?: boolean;
  /** Unique menu ID for toggle support — must be unique per instance on the page */
  menuId: string;
  /** HTML id placed on the trigger button, for external label association via htmlFor */
  buttonId?: string;
}

/**
 * Agent selector trigger button that opens a context menu with agent options.
 * Replaces native `<select>` with a styled dropdown using the context menu system.
 */
export function AgentSelector({
  agents,
  value,
  onChange,
  placeholder = "No assignment",
  allowClear = true,
  showUserOption = false,
  menuId,
  buttonId,
}: AgentSelectorProps) {
  const { toggleMenu, isMenuOpen } = useContextMenu();
  const isOpen = isMenuOpen(menuId);
  const isUserSelected = value === USER_SELF_SELECTION;
  const selectedAgent = isUserSelected ? undefined : agents.find((agent) => agent.id === value);

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    const items: ContextMenuItem[] = [];

    if (allowClear) {
      items.push({
        type: ContextMenuTypes.action,
        label: placeholder,
        onClick: () => onChange(""),
        selected: value === "",
      });
      items.push({ type: ContextMenuTypes.separator });
    }

    if (showUserOption) {
      items.push({
        type: ContextMenuTypes.action,
        label: "Myself",
        icon: User,
        onClick: () => onChange(USER_SELF_SELECTION),
        selected: isUserSelected,
      });
    }

    for (const agent of agents) {
      items.push({
        type: ContextMenuTypes.action,
        label: agent.name,
        icon: Bot,
        onClick: () => onChange(agent.id),
        selected: agent.id === value,
      });
    }

    return items;
  }, [agents, allowClear, isUserSelected, onChange, placeholder, showUserOption, value]);

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
      {isUserSelected ? (
        <>
          <User className="h-3.5 w-3.5 shrink-0 text-text-neutral" />
          <span className="flex-1 truncate text-text-base">Myself</span>
        </>
      ) : selectedAgent ? (
        <>
          <Bot className="h-3.5 w-3.5 shrink-0 text-text-neutral" />
          <span className="flex-1 truncate text-text-base">{selectedAgent.name}</span>
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
