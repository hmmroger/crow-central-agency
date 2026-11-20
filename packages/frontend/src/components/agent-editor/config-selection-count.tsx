import { CONFIG_SELECTION_MODE, type ConfigSelectionMode } from "@crow-central-agency/shared";
import type { ConfigSelection } from "./agent-editor.types.js";

interface ConfigSelectionCountProps {
  itemIds: string[];
  selection: ConfigSelection;
}

const COUNT_SUFFIX: Record<ConfigSelectionMode, string> = {
  [CONFIG_SELECTION_MODE.DISABLE_SELECTED]: "disabled",
  [CONFIG_SELECTION_MODE.ENABLE_SELECTED]: "enabled",
};

/** The list the active mode reads: the block list in disable mode, the allow list in enable-only mode. */
export function activeSelectionIds(selection: ConfigSelection): string[] {
  return selection.mode === CONFIG_SELECTION_MODE.ENABLE_SELECTED ? selection.enabled : selection.disabled;
}

/** "N of M disabled|enabled" for the active mode; selected ids that are no longer discovered are not counted. */
export function ConfigSelectionCount({ itemIds, selection }: ConfigSelectionCountProps) {
  const activeIds = new Set(activeSelectionIds(selection));
  const selectedCount = itemIds.reduce((count, itemId) => (activeIds.has(itemId) ? count + 1 : count), 0);

  return (
    <>
      {selectedCount} of {itemIds.length} {COUNT_SUFFIX[selection.mode]}
    </>
  );
}
