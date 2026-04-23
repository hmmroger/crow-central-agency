import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

const jsdomWindow = new JSDOM("").window;
const purify = DOMPurify(jsdomWindow);

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

export function sanitizeHtml(html: string): string {
  const safeHtml = purify.sanitize(html, purifyConfigGeneral);
  return safeHtml;
}
