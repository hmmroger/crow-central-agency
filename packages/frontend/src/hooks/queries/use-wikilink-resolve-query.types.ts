import type { NoteMetadata } from "@crow-central-agency/shared";

/** What each answered target names; `undefined` when it names nothing, no entry while it is unanswered */
export type WikilinkResolutionMap = ReadonlyMap<string, NoteMetadata | undefined>;
