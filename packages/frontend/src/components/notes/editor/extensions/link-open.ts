import { LINK_CLASS, LINK_URL_ATTRIBUTE } from "./inline-decorators.js";

const OPENABLE_PROTOCOLS = new Set(["http:", "https:"]);

export const PRIMARY_BUTTON = 0;

export function isOpenModifierHeld(event: MouseEvent | KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

/** Only absolute http(s) URLs open; anything relative or with another scheme stays inert. */
function toOpenableUrl(url: string): string | undefined {
  const parsed = URL.parse(url);

  return parsed && OPENABLE_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
}

/** Ctrl/Cmd + primary click on a link element opens its URL in a new tab. */
export function openLinkUnderPointer(event: MouseEvent): boolean {
  if (!isOpenModifierHeld(event) || event.button !== PRIMARY_BUTTON || !(event.target instanceof Element)) {
    return false;
  }

  const url = event.target.closest(`.${LINK_CLASS}`)?.getAttribute(LINK_URL_ATTRIBUTE);
  const openableUrl = url ? toOpenableUrl(url) : undefined;

  if (!openableUrl) {
    return false;
  }

  event.preventDefault();
  window.open(openableUrl, "_blank", "noopener,noreferrer");

  return true;
}
