import { Plus, X } from "lucide-react";
import type { KeyValuePair } from "./mcp-config-editor.types.js";

interface KeyValueListFieldProps {
  pairs: KeyValuePair[];
  onUpdate: (index: number, key: string, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

const INPUT_CLASS =
  "flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus";

/**
 * Reusable key-value pair list editor.
 * Each row has a key input, value input, and remove button.
 * "Add" button appears when the last pair has a non-empty key.
 */
export function KeyValueListField({
  pairs,
  onUpdate,
  onAdd,
  onRemove,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: KeyValueListFieldProps) {
  const lastPair = pairs[pairs.length - 1];
  const canAdd = pairs.length === 0 || (lastPair !== undefined && lastPair.key.trim() !== "");

  return (
    <div className="space-y-1.5">
      {pairs.map((pair, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            type="text"
            value={pair.key}
            onChange={(event) => onUpdate(index, event.target.value, pair.value)}
            placeholder={keyPlaceholder}
            className={INPUT_CLASS}
          />
          <input
            type="text"
            value={pair.value}
            onChange={(event) => onUpdate(index, pair.key, event.target.value)}
            placeholder={valuePlaceholder}
            className={INPUT_CLASS}
          />
          <button
            type="button"
            className="p-1 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors shrink-0"
            onClick={() => onRemove(index)}
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {canAdd && (
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
          onClick={onAdd}
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      )}
    </div>
  );
}
