import type { NoteMetadata } from "@crow-central-agency/shared";
import { createImageElement } from "../../../../utils/note-image/image-element.js";
import { resolveImageSyntax } from "./image-syntax.js";
import type { ImageSyntax } from "./image-syntax.types.js";
import { DELIMITED_CLASSES, LINK_CLASS, LINK_OPEN_HINT, LINK_URL_ATTRIBUTE } from "./inline-decorators.js";
import { TABLE_SPAN_KIND, type TableCell, type TableCellSpan } from "./table-syntax.types.js";
import { getWikilinkMarkSpec } from "./wikilink-syntax.js";
import type { WikilinkMarkSpec } from "./wikilink-syntax.types.js";

const LINE_BREAK = "\n";
const LINE_BREAK_TAG = "<br>";
const LINE_BREAK_TAG_PATTERN = /<br\s*\/?>/gi;
const LINE_BREAK_PATTERN = /\n/g;
const UNESCAPED_PIPE_PATTERN = /(?<!\\)\|/g;
const ESCAPED_PIPE = "\\|";
/** Marks a cell whose last line break is followed by an extra one, since a trailing break alone does not render */
const TRAILING_BREAK_ATTRIBUTE = "data-trailing-break";

function getSegmentBoundaries(spans: TableCellSpan[], length: number): number[] {
  const boundaries = new Set([0, length]);

  for (const span of spans) {
    boundaries.add(span.from);
    boundaries.add(span.to);
  }

  return Array.from(boundaries).sort((first, second) => first - second);
}

function toLinkAttributes(url: string): Record<string, string> {
  return { [LINK_URL_ATTRIBUTE]: url, title: LINK_OPEN_HINT };
}

function setAttributes(element: HTMLElement, attributes: Record<string, string>): void {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

/** A linked image sits inside its link's element, so Ctrl/Cmd + click on it opens the link. */
function createImageNode(image: ImageSyntax, coveringSpans: TableCellSpan[], notes: NoteMetadata[]): Node {
  const imageElement = createImageElement(resolveImageSyntax(image, notes));
  const linkSpan = coveringSpans.find((span) => span.kind === TABLE_SPAN_KIND.LINK);

  if (!linkSpan) {
    return imageElement;
  }

  const link = document.createElement("span");
  link.className = LINK_CLASS;
  setAttributes(link, toLinkAttributes(linkSpan.url));
  link.append(imageElement);

  return link;
}

/** Resolves each wikilink once, since escapes split its text into several segments. */
function buildWikilinkMarkSpecs(spans: TableCellSpan[], notes: NoteMetadata[]): Map<TableCellSpan, WikilinkMarkSpec> {
  const markSpecs = new Map<TableCellSpan, WikilinkMarkSpec>();

  for (const span of spans) {
    if (span.kind === TABLE_SPAN_KIND.WIKILINK) {
      markSpecs.set(span, getWikilinkMarkSpec(span.target, notes));
    }
  }

  return markSpecs;
}

function createSegmentNode(
  text: string,
  coveringSpans: TableCellSpan[],
  wikilinkMarkSpecs: Map<TableCellSpan, WikilinkMarkSpec>
): Node {
  const classes: string[] = [];
  const attributes: Record<string, string> = {};

  for (const span of coveringSpans) {
    if (span.kind === TABLE_SPAN_KIND.FORMAT) {
      classes.push(DELIMITED_CLASSES[span.format]);
    } else if (span.kind === TABLE_SPAN_KIND.LINK) {
      classes.push(LINK_CLASS);
      Object.assign(attributes, toLinkAttributes(span.url));
    } else if (span.kind === TABLE_SPAN_KIND.WIKILINK) {
      const markSpec = wikilinkMarkSpecs.get(span);

      if (markSpec) {
        classes.push(markSpec.className);
        Object.assign(attributes, markSpec.attributes);
      }
    }
  }

  if (classes.length === 0) {
    return document.createTextNode(text);
  }

  const element = document.createElement("span");
  element.className = classes.join(" ");
  element.textContent = text;

  setAttributes(element, attributes);

  return element;
}

/**
 * Shows the cell as rendered inline markdown: syntax marks hidden, formats and links styled, `<br>` as a
 * line break, images drawn.
 */
export function renderInactiveCell(element: HTMLElement, cell: TableCell, notes: NoteMetadata[]): void {
  const boundaries = getSegmentBoundaries(cell.spans, cell.content.length);
  const wikilinkMarkSpecs = buildWikilinkMarkSpecs(cell.spans, notes);

  element.replaceChildren();

  for (let index = 0; index < boundaries.length - 1; index++) {
    const from = boundaries[index];
    const to = boundaries[index + 1];
    const coveringSpans = cell.spans.filter((span) => span.from <= from && span.to >= to);
    const imageSpan = coveringSpans.find((span) => span.kind === TABLE_SPAN_KIND.IMAGE);

    if (imageSpan) {
      if (imageSpan.from === from) {
        element.append(createImageNode(imageSpan.image, coveringSpans, notes));
      }
    } else if (coveringSpans.some((span) => span.kind === TABLE_SPAN_KIND.LINE_BREAK)) {
      element.append(document.createElement("br"));
    } else if (!coveringSpans.some((span) => span.kind === TABLE_SPAN_KIND.MARK)) {
      element.append(createSegmentNode(cell.content.slice(from, to), coveringSpans, wikilinkMarkSpecs));
    }
  }
}

/** Adds or drops the extra final line break so a line break the user typed at the end stays visible. */
export function ensureTrailingBreak(element: HTMLElement): void {
  if (element.hasAttribute(TRAILING_BREAK_ATTRIBUTE)) {
    element.removeAttribute(TRAILING_BREAK_ATTRIBUTE);

    if (element.lastChild?.textContent === LINE_BREAK) {
      element.lastChild.remove();
    }
  }

  if (element.textContent.endsWith(LINE_BREAK)) {
    element.append(LINE_BREAK);
    element.setAttribute(TRAILING_BREAK_ATTRIBUTE, "");
  }
}

export function hasTrailingBreak(element: HTMLElement): boolean {
  return element.hasAttribute(TRAILING_BREAK_ATTRIBUTE);
}

/** Shows the cell's markdown as editable text, with each `<br>` as a line break. */
export function renderActiveCell(element: HTMLElement, markdown: string): void {
  element.textContent = markdown.replace(LINE_BREAK_TAG_PATTERN, LINE_BREAK);
  ensureTrailingBreak(element);
}

/** Converts `text` typed into a cell back to one-line cell markdown. */
export function toCellMarkdown(text: string): string {
  return text.replace(LINE_BREAK_PATTERN, LINE_BREAK_TAG).replace(UNESCAPED_PIPE_PATTERN, ESCAPED_PIPE);
}

/** The markdown of an edited cell; the extra final line break is display-only and not part of it. */
export function readActiveCell(element: HTMLElement): string {
  const text = element.textContent;

  return toCellMarkdown(hasTrailingBreak(element) && text.endsWith(LINE_BREAK) ? text.slice(0, -1) : text);
}
