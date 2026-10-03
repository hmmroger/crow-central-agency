import type { ComponentType } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";

/** A control rendered at the end of a note tree row, for acting on that note */
export interface NoteTreeAction {
  id: string;
  /** Tooltip text; also the prefix of the row button's accessible name */
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Rows this action does not apply to render no button */
  isAvailable?: (metadata: NoteMetadata) => boolean;
  onSelect: (metadata: NoteMetadata) => void;
}
