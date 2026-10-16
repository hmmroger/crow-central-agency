import { useCallback } from "react";
import { BookOpen, Clock, FileText } from "lucide-react";
import { NOTE_NAME_MAX_LENGTH, type NoteFileMetadata } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import { useAppStore } from "../../stores/app-store.js";
import { formatRelativeTime } from "../../utils/format-utils.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { Chip } from "../common/chip.js";
import { InlineTextEdit } from "../common/inline-text-edit.js";

/** Reader/editor switch for a note that can be edited */
interface NoteReadModeToggle {
  isReadMode: boolean;
  onToggle: () => void;
}

interface NoteHeaderProps {
  note: NoteFileMetadata;
  /** Shows the unsaved badge until the draft reaches the backend */
  isUnsaved?: boolean;
  /** Omit for a read-only note, which has no mode to switch */
  readModeToggle?: NoteReadModeToggle;
}

const UNSAVED_LABEL = "Unsaved";
const READ_MODE_LABEL = "Read mode";
const LAST_EDITED_PREFIX = "Last edited";
const UNSAVED_CHIP_CLASS = "shrink-0 border-warning/40 bg-warning/10 text-warning";

/**
 * Identity bar above the canvas: note name, when it was last written, and whether it still holds unsaved edits.
 * A live note's name is renamed in place; the renamed note stays selected under its new id.
 * An editable note also gets the read-mode toggle on the trailing side.
 */
export function NoteHeader({ note, isUnsaved = false, readModeToggle }: NoteHeaderProps) {
  const { updateNote } = useNotesContext();
  const selectNote = useAppStore((state) => state.selectNote);

  const handleRename = useCallback(
    async (name: string) => selectNote(await updateNote(note.id, { name })),
    [updateNote, note.id, selectNote]
  );

  return (
    <header className="flex items-center gap-2.5 border-b border-border-subtle px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-elevated">
        <FileText className="h-6 w-6 text-accent" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 has-[input]:flex-1">
            <InlineTextEdit
              value={note.name}
              onSubmit={handleRename}
              label={`Rename ${note.name}`}
              maxLength={NOTE_NAME_MAX_LENGTH}
              disabled={note.isTrashed}
              className="text-lg font-semibold text-text-base"
            />
          </h1>
          {isUnsaved && <Chip label={UNSAVED_LABEL} className={UNSAVED_CHIP_CLASS} />}
        </div>

        <p className="flex items-center gap-1 text-2xs text-text-muted">
          <Clock className="h-3 w-3 shrink-0" />
          {`${LAST_EDITED_PREFIX} ${formatRelativeTime(note.updatedTimestamp)}`}
        </p>
      </div>

      {readModeToggle && (
        <ActionButton
          icon={BookOpen}
          label={READ_MODE_LABEL}
          variant={ACTION_BUTTON_VARIANT.GHOST}
          iconOnly
          isActive={readModeToggle.isReadMode}
          onClick={readModeToggle.onToggle}
          className="shrink-0"
        />
      )}
    </header>
  );
}
