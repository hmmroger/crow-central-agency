import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import type { WikilinkCreatePlan } from "./wikilink-create.types.js";
import { isSameNoteName, toComparableName, toTargetSegments } from "./wikilink-resolver.js";

const CREATION_KEY_SEPARATOR = "/";

function findChildFolder(notes: NoteMetadata[], parentId: string | undefined, name: string): NoteMetadata | undefined {
  return notes.find(
    (metadata) =>
      metadata.entityType === ENTITY_TYPE.NOTE_FOLDER &&
      metadata.parentId === parentId &&
      isSameNoteName(metadata.name, name)
  );
}

/**
 * Where to create the text note an unresolved target names. A bare name goes beside `currentNote`;
 * a qualified `a/b/name` goes at that path from the notes root, reusing the folders that exist.
 */
export function planWikilinkCreation(
  notes: NoteMetadata[],
  target: string,
  currentNote: NoteMetadata | undefined
): WikilinkCreatePlan | undefined {
  const segments = toTargetSegments(target);
  const noteName = segments.pop();

  if (noteName === undefined) {
    return undefined;
  }

  if (segments.length === 0) {
    return { parentId: currentNote?.parentId, missingFolderNames: [], noteName };
  }

  let parentId: string | undefined;
  let existingCount = 0;

  for (const folderName of segments) {
    const folder = findChildFolder(notes, parentId, folderName);

    if (!folder) {
      break;
    }

    parentId = folder.id;
    existingCount++;
  }

  return { parentId, missingFolderNames: segments.slice(existingCount), noteName };
}

/** Identifies the note a plan creates, compared the way note names are, so every spelling of it shares one key. */
export function toWikilinkCreationKey(plan: WikilinkCreatePlan): string {
  const parentKeys = plan.parentId === undefined ? [] : [plan.parentId];

  return parentKeys.concat(plan.missingFolderNames, plan.noteName).map(toComparableName).join(CREATION_KEY_SEPARATOR);
}
