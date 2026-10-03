import type { NoteFileMetadata } from "@crow-central-agency/shared";
import { noteContentQueryOptions } from "../../hooks/queries/use-note-content-query.js";
import { queryClient } from "../../services/query-client.js";
import { RESOLVED_IMAGE_KIND, type ResolvedImage } from "./resolved-image.types.js";
import { NoteImageCache } from "./note-image-cache.js";

export const IMAGE_CLASS = "cm-md-image";

const MISSING_IMAGE_CLASS = "cm-md-image-missing";
/** The note whose shared image the element holds, until it is released */
const NOTE_ID_ATTRIBUTE = "data-note-id";

async function loadNoteImageUrl(note: NoteFileMetadata): Promise<string | undefined> {
  const content = await queryClient.fetchQuery(noteContentQueryOptions(note));

  return content.type === "binary" ? content.blobUrl : undefined;
}

const noteImageCache = new NoteImageCache(loadNoteImageUrl);

function createChip(text: string): HTMLElement {
  const chip = document.createElement("span");
  chip.className = MISSING_IMAGE_CLASS;
  chip.textContent = text;

  return chip;
}

async function loadNoteImage(container: HTMLElement, image: HTMLImageElement, note: NoteFileMetadata): Promise<void> {
  try {
    const url = await noteImageCache.acquire(note);

    if (url !== undefined && container.hasAttribute(NOTE_ID_ATTRIBUTE)) {
      image.src = url;
    }
  } catch {
    container.replaceChildren(createChip(`Image failed to load: ${note.name}`));
  }
}

/** The element an image stands in its markdown's place with; a note image loads through the note content query. */
export function createImageElement(resolved: ResolvedImage): HTMLElement {
  if (resolved.kind === RESOLVED_IMAGE_KIND.MISSING) {
    return createChip(`Missing image: ${resolved.target}`);
  }

  const container = document.createElement("span");
  const image = document.createElement("img");
  container.className = IMAGE_CLASS;
  image.loading = "lazy";
  container.append(image);

  if (resolved.kind === RESOLVED_IMAGE_KIND.URL) {
    image.alt = resolved.alt;
    image.src = resolved.url;
  } else {
    image.alt = resolved.note.name;
    container.setAttribute(NOTE_ID_ATTRIBUTE, resolved.note.id);
    void loadNoteImage(container, image, resolved.note);
  }

  return container;
}

/** Lets go of the shared note image behind every image drawn inside `element`, including loads still in flight. */
export function releaseImageElements(element: HTMLElement): void {
  const containers = element.classList.contains(IMAGE_CLASS)
    ? [element]
    : Array.from(element.querySelectorAll<HTMLElement>(`.${IMAGE_CLASS}`));

  for (const container of containers) {
    const noteId = container.getAttribute(NOTE_ID_ATTRIBUTE);

    if (noteId !== null) {
      container.removeAttribute(NOTE_ID_ATTRIBUTE);
      noteImageCache.release(noteId);
    }
  }
}
