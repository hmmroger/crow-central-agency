import DOMPurify from "dompurify";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { ANCHOR_TRANSLATORS } from "./anchor-translator.js";
import type { PastePurifyConfig } from "./html-to-markdown.types.js";

const PASTE_PURIFY_CONFIG: PastePurifyConfig = {
  USE_PROFILES: { html: true },
  ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp):\/\/|(?:mailto|tel):)/i,
  RETURN_DOM_FRAGMENT: true,
};

const MARKDOWN_STRUCTURE_SELECTOR = [
  "a[href]",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "table",
  "blockquote",
  "pre",
  "hr",
  "img",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "del",
  "code",
].join(",");

// Own instance, so hooks the app registers on the shared DOMPurify never run on pastes.
const pastePurify = DOMPurify(window);

const inertDocument = document.implementation.createHTMLDocument("");

const htmlToMarkdown = new NodeHtmlMarkdown({ bulletMarker: "-", useInlineLinks: true }, ANCHOR_TRANSLATORS);

/** Sanitizes pasted HTML, keeping only absolute web, mail and phone links, into an inert container where nothing loads. */
export function sanitizePastedHtml(html: string): HTMLElement {
  const container = inertDocument.createElement("div");
  container.append(pastePurify.sanitize(html, PASTE_PURIFY_CONFIG));

  return container;
}

/** False for styling-only HTML (e.g. a code editor's highlighted `div`/`span` copy), which is better pasted as plain text. */
export function hasMarkdownStructure(sanitizedHtml: HTMLElement): boolean {
  return sanitizedHtml.querySelector(MARKDOWN_STRUCTURE_SELECTOR) !== null;
}

export function convertHtmlToMarkdown(sanitizedHtml: HTMLElement): string {
  return htmlToMarkdown.translate(sanitizedHtml.innerHTML.trim());
}
