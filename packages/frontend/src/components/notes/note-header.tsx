import { Clock, FileText } from "lucide-react";
import type { NoteFileMetadata } from "@crow-central-agency/shared";
import { formatRelativeTime } from "../../utils/format-utils.js";
import { Chip } from "../common/chip.js";

interface NoteHeaderProps {
  note: NoteFileMetadata;
  /** Shows the unsaved badge until the draft reaches the backend */
  isUnsaved?: boolean;
}

const UNSAVED_LABEL = "Unsaved";
const LAST_EDITED_PREFIX = "Last edited";
const UNSAVED_CHIP_CLASS = "shrink-0 border-warning/40 bg-warning/10 text-warning";

/** Identity bar above the canvas: note name, when it was last written, and whether it still holds unsaved edits. */
export function NoteHeader({ note, isUnsaved = false }: NoteHeaderProps) {
  return (
    <header className="flex items-center gap-2.5 border-b border-border-subtle px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-elevated">
        <FileText className="h-6 w-6 text-accent" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg font-semibold text-text-base">{note.name}</h1>
          {isUnsaved && <Chip label={UNSAVED_LABEL} className={UNSAVED_CHIP_CLASS} />}
        </div>

        <p className="flex items-center gap-1 text-2xs text-text-muted">
          <Clock className="h-3 w-3 shrink-0" />
          {`${LAST_EDITED_PREFIX} ${formatRelativeTime(note.updatedTimestamp)}`}
        </p>
      </div>
    </header>
  );
}
