import {
  ENTITY_TYPE,
  MARKDOWN_WIKI_EMBED_CLASS,
  MARKDOWN_WIKILINK_CLASS,
  MARKDOWN_WIKILINK_TARGET_ATTRIBUTE,
  type NoteMetadata,
} from "@crow-central-agency/shared";
import type { WikilinkResolutionMap } from "../../../hooks/queries/use-wikilink-resolve-query.types.js";
import { createImageElement, releaseImageElements } from "../note-image/image-element.js";

const UNRESOLVED_CLASS = "note-wikilink-unresolved";
const OPEN_KEY = "Enter";

function resolveOpenableNote(resolutions: WikilinkResolutionMap, link: Element): NoteMetadata | undefined {
  const target = link.getAttribute(MARKDOWN_WIKILINK_TARGET_ATTRIBUTE);
  const note = target === null ? undefined : resolutions.get(target);

  return note?.entityType === ENTITY_TYPE.NOTE ? note : undefined;
}

function markLink(resolutions: WikilinkResolutionMap, link: HTMLElement): void {
  const isOpenable = resolveOpenableNote(resolutions, link) !== undefined;
  link.classList.toggle(UNRESOLVED_CLASS, !isOpenable);

  if (isOpenable) {
    link.setAttribute("role", "link");
    link.tabIndex = 0;
  } else {
    link.removeAttribute("role");
    link.removeAttribute("tabindex");
  }
}

function drawEmbed(resolutions: WikilinkResolutionMap, embed: HTMLElement): void {
  const target = embed.getAttribute(MARKDOWN_WIKILINK_TARGET_ATTRIBUTE);
  if (target === null) {
    return;
  }

  releaseImageElements(embed);
  embed.replaceChildren(createImageElement(resolutions.get(target), target));
}

function findLinkEvent(event: Event, container: HTMLElement): Element | undefined {
  const link = event.target instanceof Element ? event.target.closest(`.${MARKDOWN_WIKILINK_CLASS}`) : undefined;

  return link && container.contains(link) ? link : undefined;
}

/**
 * Brings rendered wikilink placeholders to life from the resolve answers: a link to a note opens it on
 * click or Enter, an unresolved link is styled and inert, and an embed not yet drawn from these answers
 * draws its image. Returns the cleanup, which removes the listeners; the drawn images stay with their embeds.
 */
export function renderMarkdownWikilinks(
  container: HTMLElement,
  resolutions: WikilinkResolutionMap,
  embedResolutions: WeakMap<Element, WikilinkResolutionMap>,
  onOpenNote: (note: NoteMetadata) => void
): () => void {
  for (const link of Array.from(container.querySelectorAll<HTMLElement>(`.${MARKDOWN_WIKILINK_CLASS}`))) {
    markLink(resolutions, link);
  }

  for (const embed of Array.from(container.querySelectorAll<HTMLElement>(`.${MARKDOWN_WIKI_EMBED_CLASS}`))) {
    if (embedResolutions.get(embed) !== resolutions) {
      drawEmbed(resolutions, embed);
      embedResolutions.set(embed, resolutions);
    }
  }

  const handleActivate = (event: MouseEvent | KeyboardEvent) => {
    const link = findLinkEvent(event, container);
    const note = link ? resolveOpenableNote(resolutions, link) : undefined;

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
  };
}
