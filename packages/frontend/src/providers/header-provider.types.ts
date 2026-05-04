import type { ContextMenuItem } from "./context-menu-provider.types.js";

/** Optional dropdown attached to the end of the header title. */
export interface HeaderDropdownConfig {
  /** Unique menu id used by the context menu system to support open/close toggling. */
  menuId: string;
  /** Items shown when the dropdown opens. */
  items: ContextMenuItem[];
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
}
