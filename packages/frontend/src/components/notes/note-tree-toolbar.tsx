import { FilePlus, FolderPlus, Trash2 } from "lucide-react";
import { ActionButton } from "../common/action-button.js";

interface NoteTreeToolbarProps {
  /** Name of the folder new notes land in */
  targetName: string;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onOpenTrash: () => void;
}

/** Create controls for the notes sidebar, labelled with their destination. */
export function NoteTreeToolbar({ targetName, onCreateNote, onCreateFolder, onOpenTrash }: NoteTreeToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-1 px-1 pb-1">
      <span className="min-w-0 truncate text-3xs uppercase tracking-wide text-text-muted" title={targetName}>
        {targetName}
      </span>
      <div className="flex shrink-0 gap-1">
        <ActionButton icon={FilePlus} label={`New note in ${targetName}`} iconOnly onClick={onCreateNote} />
        <ActionButton icon={FolderPlus} label={`New folder in ${targetName}`} iconOnly onClick={onCreateFolder} />
        <ActionButton icon={Trash2} label="Open trash" iconOnly onClick={onOpenTrash} />
      </div>
    </div>
  );
}
