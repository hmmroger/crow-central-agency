import type { ComponentType } from "react";
import type { ContextMenuItem } from "./context-menu-provider.types.js";

/** Optional dropdown attached to the end of the header title. */
export interface HeaderDropdownConfig {
  /** Unique menu id used by the context menu system to support open/close toggling. */
  menuId: string;
  /** Items shown when the dropdown opens. */
  items: ContextMenuItem[];
}

/** Header action button rendered on the right of the header. By default visible only below the side-panel breakpoint. */
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
  /** When true, the action renders at all breakpoints. Defaults to false (visible only below the side-panel breakpoint). */
  alwaysVisible?: boolean;
}

/** A crumb rendered after the header title; the last one is the current item. */
export interface HeaderBreadcrumb {
  id: string;
  label: string;
  /** Ignored on the last crumb, which is never clickable. */
  onClick?: () => void;
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
  /** Currently registered breadcrumbs. Empty array when none are set. */
  breadcrumbs: HeaderBreadcrumb[];
  /** Set or clear the breadcrumbs. Stable reference. */
  setBreadcrumbs: (breadcrumbs: HeaderBreadcrumb[]) => void;
}
