import type { Placement } from "@floating-ui/react";
import type { LucideIcon } from "lucide-react";

// Rect for dropdown anchors (element position/size)
export interface ContextMenuRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// --- Menu item discriminated union ---
export type ContextMenuType = keyof typeof ContextMenuTypes;
export const ContextMenuTypes = {
  action: "action",
  separator: "separator",
  header: "header",
  custom: "custom",
} as const;

export interface ContextMenuCommon {
  type: ContextMenuType;
}

export interface ContextMenuAction extends ContextMenuCommon {
  type: "action";
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  /** When true, renders a checkmark and selected styling (menuitemradio semantics) */
  selected?: boolean;
}

export interface ContextMenuSeparator extends ContextMenuCommon {
  type: "separator";
}

export interface ContextMenuHeader extends ContextMenuCommon {
  type: "header";
  label: string;
}

/** Props passed to custom menu item components by the renderer */
export interface ContextMenuCustomRenderProps extends React.HTMLAttributes<HTMLElement> {
  ref?: (el: HTMLElement | null) => void;
  isActive: boolean;
  onClose: () => void;
}

export interface ContextMenuCustom extends ContextMenuCommon {
  type: "custom";
  render: React.ComponentType<ContextMenuCustomRenderProps>;
}

export type ContextMenuItem = ContextMenuAction | ContextMenuSeparator | ContextMenuHeader | ContextMenuCustom;

// --- Config passed to showMenu() ---

export interface ContextMenuConfig {
  /** Stable identifier for toggle support (e.g., entity id) */
  id?: string;
  /** Dropdown anchor: trigger element's bounding rect */
  anchorRect?: ContextMenuRect;
  /** Context menu: cursor x */
  x?: number;
  /** Context menu: cursor y */
  y?: number;
  items: ContextMenuItem[];
  /** @floating-ui/react placement, defaults to 'bottom-end' */
  placement?: Placement;
  /** Optional container class (e.g., "w-md" for wider menus) */
  className?: string;
  /** Optional inline styles (e.g., dynamic min-width matching a trigger element) */
  style?: React.CSSProperties;
  /** Called when menu dismisses for any reason */
  onClose?: () => void;
}

// --- Public context value ---

export interface ContextMenuContextValue {
  showMenu: (config: ContextMenuConfig) => void;
  /** Toggle a menu by id: opens if closed or different id, closes if same id is already open */
  toggleMenu: (config: ContextMenuConfig & { id: string }) => void;
  hideMenu: () => void;
  /** Check whether a menu with the given id is currently open */
  isMenuOpen: (id: string) => boolean;
}
