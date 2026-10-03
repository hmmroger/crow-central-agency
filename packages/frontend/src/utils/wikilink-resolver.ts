import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import type { WikilinkCandidate } from "./wikilink-resolver.types";

const TARGET_SEPARATOR = "/";

/** Names compare case-insensitively, the same way note ids are derived. */
export function toComparableName(name: string): string {
  return name.toLowerCase();
}

export function isSameNoteName(name: string, otherName: string): boolean {
  return toComparableName(name) === toComparableName(otherName);
}

/** The target's `/`-separated segments, blank ones dropped; the last is the note's name. */
export function toTargetSegments(target: string): string[] {
  return target
    .split(TARGET_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function buildMetadataById(notes: NoteMetadata[]): Map<string, NoteMetadata> {
  return new Map(notes.map((metadata) => [metadata.id, metadata]));
}

/** `note` matches when the last segment is its name and the leading ones end its folder path. */
function matchTargetSegments(
  metadataById: Map<string, NoteMetadata>,
  note: NoteMetadata,
  segments: string[]
): WikilinkCandidate | undefined {
  const lastIndex = segments.length - 1;
  if (!isSameNoteName(note.name, segments[lastIndex])) {
    return undefined;
  }

  let parentId = note.parentId;
  for (let index = lastIndex - 1; index >= 0; index--) {
    const parent = parentId === undefined ? undefined : metadataById.get(parentId);
    if (!parent || !isSameNoteName(parent.name, segments[index])) {
      return undefined;
    }

    parentId = parent.parentId;
  }

  return { note, isRootAnchored: parentId === undefined };
}

function findCandidates(
  notes: NoteMetadata[],
  metadataById: Map<string, NoteMetadata>,
  segments: string[]
): WikilinkCandidate[] {
  const candidates: WikilinkCandidate[] = [];
  for (const note of notes) {
    const candidate = matchTargetSegments(metadataById, note, segments);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Resolve a `[[target]]` to a note. The last `/` segment is the note's name and
 * any leading segments are a suffix of its folder path. A root-anchored match
 * wins; otherwise the first match, preferring a note over a folder. Never
 * filters by content type.
 */
export function resolveWikilinkTarget(notes: NoteMetadata[], target: string): NoteMetadata | undefined {
  const segments = toTargetSegments(target);
  if (segments.length === 0) {
    return undefined;
  }

  const candidates = findCandidates(notes, buildMetadataById(notes), segments);
  const preferred =
    candidates.find((candidate) => candidate.isRootAnchored) ??
    candidates.find((candidate) => candidate.note.entityType !== ENTITY_TYPE.NOTE_FOLDER) ??
    candidates[0];

  return preferred?.note;
}

/**
 * The shortest target that names exactly `note`: its bare name, qualified with
 * one parent folder at a time until no other note matches. A full path always
 * resolves back to `note` because root-anchored matches win.
 */
export function toShortestWikilinkTarget(notes: NoteMetadata[], note: NoteMetadata): string {
  const metadataById = buildMetadataById(notes);
  const segments = [note.name];
  let parentId = note.parentId;

  while (findCandidates(notes, metadataById, segments).length > 1) {
    const parent = parentId === undefined ? undefined : metadataById.get(parentId);
    if (!parent) {
      break;
    }

    segments.unshift(parent.name);
    parentId = parent.parentId;
  }

  return segments.join(TARGET_SEPARATOR);
}
