import type { NoteMetadata } from "@crow-central-agency/shared";
import type { NoteTreeAction } from "./note-tree.types.js";

interface NoteTreeActionButtonProps {
  action: NoteTreeAction;
  metadata: NoteMetadata;
}

/**
 * Row-level action control. Revealed on hover, but always focusable so the
 * whole tree stays operable from the keyboard.
 */
export function NoteTreeActionButton({ action, metadata }: NoteTreeActionButtonProps) {
  const { icon: Icon, label, onSelect } = action;

  return (
    <button
      type="button"
      title={label}
      aria-label={`${label} ${metadata.name}`}
      className="shrink-0 p-1 rounded-sm text-text-muted opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-text-base"
      onClick={() => onSelect(metadata)}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
