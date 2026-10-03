import type { NoteMetadata } from "@crow-central-agency/shared";

/** A note that a wikilink target matches. */
export interface WikilinkCandidate {
  note: NoteMetadata;
  /** The target's folder segments reach the notes root, so it named the full path */
  isRootAnchored: boolean;
}
