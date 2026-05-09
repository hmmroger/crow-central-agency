import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

const jsdomWindow = new JSDOM("").window;
const purify = DOMPurify(jsdomWindow);
const purifyEmail = DOMPurify(jsdomWindow);

const TABLE_LAYOUT_TAGS = ["table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col"];
const TABLE_CELL_TAGS = new Set(["td", "th", "tr"]);
const IMG_TAG = "img";

/**
 * DOMPurify config for general markdown output
 */
const purifyConfigGeneral = {
  // This automatically whitelists standard HTML (p, div, h1, table, etc.)
  // and standard SVG (path, g, circle, rect, etc.)
  USE_PROFILES: { html: true, svg: true },

  // High-value safety: ensure links don't leak tab control
  ADD_ATTR: ["target", "rel"],

  // Standard security precaution
  FORBID_ATTR: ["onerror", "onclick", "onload"],
};

const purifyConfigEmail = {
  ...purifyConfigGeneral,
  FORBID_TAGS: TABLE_LAYOUT_TAGS,
  KEEP_CONTENT: true,
};

purifyEmail.addHook("uponSanitizeElement", (currentNode, hookEvent) => {
  if (TABLE_CELL_TAGS.has(hookEvent.tagName)) {
    appendBreakToCell(currentNode);
    return;
  }

  if (hookEvent.tagName === IMG_TAG) {
    replaceImageWithAlt(currentNode);
  }
});

// Append a <br> inside each cell/row before stripping its wrapper so the
// flattened content keeps cell boundaries on separate lines.
function appendBreakToCell(node: Node): void {
  const ownerDoc = node.ownerDocument;
  if (ownerDoc === null) {
    return;
  }

  node.appendChild(ownerDoc.createElement("br"));
}

function replaceImageWithAlt(node: Node): void {
  const ownerDoc = node.ownerDocument;
  if (ownerDoc === null) {
    return;
  }

  const parent = node.parentNode;
  if (parent === null) {
    return;
  }

  const alt = isElement(node) ? (node.getAttribute("alt") ?? "") : "";
  parent.replaceChild(ownerDoc.createTextNode(alt), node);
}

function isElement(node: Node): node is Element {
  return node.nodeType === jsdomWindow.Node.ELEMENT_NODE;
}

export function sanitizeHtml(html: string): string {
  const safeHtml = purify.sanitize(html, purifyConfigGeneral);
  return safeHtml;
}

export function sanitizeEmailHtml(html: string): string {
  const safeHtml = purifyEmail.sanitize(html, purifyConfigEmail);
  return safeHtml;
}
