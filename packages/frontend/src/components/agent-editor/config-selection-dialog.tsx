import { useCallback, useMemo, useState } from "react";
import { CONFIG_SELECTION_MODE, type ConfigSelectionMode } from "@crow-central-agency/shared";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { ToggleButton } from "./tool-config/toggle-button.js";
import { ConfigSelectionCount, activeSelectionIds } from "./config-selection-count.js";
import type { ConfigSelection, ConfigSelectionItem } from "./agent-editor.types.js";

interface ConfigSelectionDialogProps {
  items: ConfigSelectionItem[];
  selection: ConfigSelection;
  /** Plural noun for the listed items, e.g. "skills". */
  itemNoun: string;
  onSave: (selection: ConfigSelection) => void;
  onClose: () => void;
}

const MODE_OPTIONS: { mode: ConfigSelectionMode; label: string }[] = [
  { mode: CONFIG_SELECTION_MODE.DISABLE_SELECTED, label: "Disable selected" },
  { mode: CONFIG_SELECTION_MODE.ENABLE_SELECTED, label: "Enable only selected" },
];

/**
 * Multi-select dialog for a customize-config list with a disable-selected / enable-only-selected
 * mode toggle. Each mode keeps its own selection. Entries in either list that are no longer
 * discovered are preserved on save so they apply again if the item returns.
 */
export function ConfigSelectionDialog({ items, selection, itemNoun, onSave, onClose }: ConfigSelectionDialogProps) {
  const [draft, setDraft] = useState<ConfigSelection>(selection);
  const activeIds = useMemo(() => new Set(activeSelectionIds(draft)), [draft]);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const isEnableMode = draft.mode === CONFIG_SELECTION_MODE.ENABLE_SELECTED;

  const setActiveIds = useCallback((ids: string[]) => {
    setDraft((prev) =>
      prev.mode === CONFIG_SELECTION_MODE.ENABLE_SELECTED ? { ...prev, enabled: ids } : { ...prev, disabled: ids }
    );
  }, []);

  const handleModeChange = useCallback((mode: ConfigSelectionMode) => {
    setDraft((prev) => ({ ...prev, mode }));
  }, []);

  const handleToggle = useCallback(
    (itemId: string) => {
      setActiveIds(
        activeIds.has(itemId)
          ? Array.from(activeIds).filter((selectedId) => selectedId !== itemId)
          : Array.from(activeIds).concat(itemId)
      );
    },
    [activeIds, setActiveIds]
  );

  const handleSelectAll = useCallback(() => setActiveIds(itemIds), [itemIds, setActiveIds]);

  const handleClearAll = useCallback(() => setActiveIds([]), [setActiveIds]);

  const handleSave = useCallback(() => {
    const discoveredIds = new Set(itemIds);
    const mergeSelection = (draftIds: string[], savedIds: string[]) => {
      const selectedIds = new Set(draftIds);
      return itemIds
        .filter((itemId) => selectedIds.has(itemId))
        .concat(savedIds.filter((itemId) => !discoveredIds.has(itemId)));
    };

    onSave({
      mode: draft.mode,
      disabled: mergeSelection(draft.disabled, selection.disabled),
      enabled: mergeSelection(draft.enabled, selection.enabled),
    });
    onClose();
  }, [itemIds, draft, selection, onSave, onClose]);

  const hasActiveSelection = itemIds.some((itemId) => activeIds.has(itemId));

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          {MODE_OPTIONS.map((option) => (
            <ToggleButton
              key={option.mode}
              active={draft.mode === option.mode}
              onClick={() => handleModeChange(option.mode)}
              label={option.label}
            />
          ))}
        </div>
        <p className="text-xs text-text-muted">
          {isEnableMode ? (
            <>
              Check the {itemNoun} the agent should <strong className="font-semibold text-text-neutral">use</strong>.
              All others, including newly discovered {itemNoun}, are off.
            </>
          ) : (
            <>
              Check the {itemNoun} the agent should <strong className="font-semibold text-text-neutral">ignore</strong>.
              Newly discovered {itemNoun} are on.
            </>
          )}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">
            <ConfigSelectionCount itemIds={itemIds} selection={draft} />
          </span>
          <div className="flex gap-2">
            <ActionButton label="Select all" onClick={handleSelectAll} />
            <ActionButton label="Clear" onClick={handleClearAll} disabled={!hasActiveSelection} />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto rounded border border-border-subtle/40 bg-surface-inset/40 p-2">
          {items.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-3">No {itemNoun} discovered yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <label key={item.key} className="flex items-center gap-2 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeIds.has(item.id)}
                    onChange={() => handleToggle(item.id)}
                    className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30 shrink-0"
                  />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-xs text-text-neutral truncate" title={item.label}>
                      {item.label}
                    </span>
                    {item.detail && (
                      <span className="text-2xs text-text-muted truncate" title={item.detail}>
                        {item.detail}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} />
        <ActionButton label="Save" variant={ACTION_BUTTON_VARIANT.PRIMARY} onClick={handleSave} />
      </div>
    </div>
  );
}
