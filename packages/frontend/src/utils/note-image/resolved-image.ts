import { ENTITY_TYPE, NOTE_CONTENT_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { resolveWikilinkTarget } from "../wikilink-resolver.js";
import { RESOLVED_IMAGE_KIND, type ResolvedImage } from "./resolved-image.types.js";

/** An embed shows an image only when its target resolves to an image note; anything else is missing. */
export function resolveEmbedTarget(target: string, notes: NoteMetadata[]): ResolvedImage {
  const note = resolveWikilinkTarget(notes, target);

  if (note?.entityType === ENTITY_TYPE.NOTE && note.contentType === NOTE_CONTENT_TYPE.IMAGE) {
    return { kind: RESOLVED_IMAGE_KIND.NOTE, note };
  }

  return { kind: RESOLVED_IMAGE_KIND.MISSING, target };
}

/** Identifies what a resolved image loads, so an unchanged image keeps its drawn element. */
export function getResolvedImageKey(image: ResolvedImage): string {
  switch (image.kind) {
    case RESOLVED_IMAGE_KIND.NOTE:
      return `${image.kind}:${image.note.id}:${image.note.updatedTimestamp}`;
    case RESOLVED_IMAGE_KIND.URL:
      return `${image.kind}:${image.url}`;
    case RESOLVED_IMAGE_KIND.MISSING:
      return image.kind;
  }
}
