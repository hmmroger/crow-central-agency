import type { ComponentType } from "react";
import type { ContextMenuItem } from "./context-menu-provider.types.js";

/** Optional dropdown attached to the end of the header title. */
export interface HeaderDropdownConfig {
  /** Unique menu id used by the context menu system to support open/close toggling. */
  menuId: string;
  /** Items shown when the dropdown opens. */
  items: ContextMenuItem[];
}

/** Header action button rendered on the right of the header below the side-panel breakpoint. */
export interface HeaderAction {
  /** Unique id used as React key and for selected-state matching. */
  id: string;
  /** Tooltip and aria-label. */
  label: string;
  /** Icon component, sized via className passed by the renderer. */
  icon: ComponentType<{ className?: string }>;
  /** Click handler. */
  onClick: () => void;
  /** When true, the action button shows an active highlight. */
  selected?: boolean;
}

/** Value exposed by the HeaderProvider context. */
export interface HeaderContextValue {
  /** Current header title. */
  title: string;
  /** Set the header title. Stable reference; no-ops when value is unchanged. */
  setTitle: (title: string) => void;
  /** Dropdown config currently attached to the title, if any. */
  dropdown: HeaderDropdownConfig | undefined;
  /** Set or clear the header dropdown. Stable reference. */
  setDropdown: (dropdown: HeaderDropdownConfig | undefined) => void;
  /** Currently registered header actions. Empty array when none are set. */
  actions: HeaderAction[];
  /** Set or clear the header actions. Stable reference. */
  setActions: (actions: HeaderAction[]) => void;
}
