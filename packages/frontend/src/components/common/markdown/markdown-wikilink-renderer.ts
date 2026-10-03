import {
  ENTITY_TYPE,
  MARKDOWN_WIKI_EMBED_CLASS,
  MARKDOWN_WIKILINK_CLASS,
  MARKDOWN_WIKILINK_TARGET_ATTRIBUTE,
  type NoteMetadata,
} from "@crow-central-agency/shared";
import { resolveWikilinkTarget } from "../../../utils/wikilink-resolver.js";
import { createImageElement, releaseImageElements } from "../../../utils/note-image/image-element.js";
import { resolveEmbedTarget } from "../../../utils/note-image/resolved-image.js";

const UNRESOLVED_CLASS = "note-wikilink-unresolved";
const OPEN_KEY = "Enter";

function resolveOpenableNote(notes: NoteMetadata[], link: Element): NoteMetadata | undefined {
  const target = link.getAttribute(MARKDOWN_WIKILINK_TARGET_ATTRIBUTE);
  const note = target ? resolveWikilinkTarget(notes, target) : undefined;

  return note?.entityType === ENTITY_TYPE.NOTE ? note : undefined;
}

function markLink(notes: NoteMetadata[], link: HTMLElement): void {
  const isOpenable = resolveOpenableNote(notes, link) !== undefined;
  link.classList.toggle(UNRESOLVED_CLASS, !isOpenable);

  if (isOpenable) {
    link.setAttribute("role", "link");
    link.tabIndex = 0;
  } else {
    link.removeAttribute("role");
    link.removeAttribute("tabindex");
  }
}

/** Replaces whatever the embed held, including a serialized copy of an earlier render, without releasing it. */
function drawEmbed(notes: NoteMetadata[], embed: HTMLElement): HTMLElement | undefined {
  const target = embed.getAttribute(MARKDOWN_WIKILINK_TARGET_ATTRIBUTE);
  if (target === null) {
    return undefined;
  }

  const image = createImageElement(resolveEmbedTarget(target, notes));
  embed.replaceChildren(image);

  return image;
}

function findLinkEvent(event: Event, container: HTMLElement): Element | undefined {
  const link = event.target instanceof Element ? event.target.closest(`.${MARKDOWN_WIKILINK_CLASS}`) : undefined;

  return link && container.contains(link) ? link : undefined;
}

/**
 * Brings rendered wikilink placeholders to life: a link to a note opens it on click or Enter, an
 * unresolved link is styled and inert, and an embed draws its image. Returns the cleanup, which lets go of
 * the images.
 */
export function renderMarkdownWikilinks(
  container: HTMLElement,
  notes: NoteMetadata[],
  onOpenNote: (note: NoteMetadata) => void
): () => void {
  for (const link of Array.from(container.querySelectorAll<HTMLElement>(`.${MARKDOWN_WIKILINK_CLASS}`))) {
    markLink(notes, link);
  }

  const images: HTMLElement[] = [];
  for (const embed of Array.from(container.querySelectorAll<HTMLElement>(`.${MARKDOWN_WIKI_EMBED_CLASS}`))) {
    const image = drawEmbed(notes, embed);
    if (image) {
      images.push(image);
    }
  }

  const handleActivate = (event: MouseEvent | KeyboardEvent) => {
    const link = findLinkEvent(event, container);
    const note = link ? resolveOpenableNote(notes, link) : undefined;

    if (!note || (event instanceof KeyboardEvent && event.key !== OPEN_KEY)) {
      return;
    }

    event.preventDefault();
    onOpenNote(note);
  };

  container.addEventListener("click", handleActivate);
  container.addEventListener("keydown", handleActivate);

  return () => {
    container.removeEventListener("click", handleActivate);
    container.removeEventListener("keydown", handleActivate);

    for (const image of images) {
      releaseImageElements(image);
    }
  };
}
