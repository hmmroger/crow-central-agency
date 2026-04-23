import { Plus, X } from "lucide-react";

interface StringListFieldProps {
  items: string[];
  onUpdate: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  placeholder?: string;
}

const INPUT_CLASS =
  "flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus";

/**
 * Reusable string list editor.
 * Each row has a text input and remove button.
 * "Add" button appears when the last item has a non-empty value.
 */
export function StringListField({ items, onUpdate, onAdd, onRemove, placeholder = "Value" }: StringListFieldProps) {
  const lastItem = items[items.length - 1];
  const canAdd = items.length === 0 || (lastItem !== undefined && lastItem.trim() !== "");

  return (
    <div className="space-y-1.5">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            type="text"
            value={item}
            onChange={(event) => onUpdate(index, event.target.value)}
            placeholder={placeholder}
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
