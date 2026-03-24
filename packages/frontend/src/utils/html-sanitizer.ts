import DOMPurify from "dompurify";

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

/**
 * DOMPurify config for mermaid SVG output
 */
const purifyConfigMermaid = {
  // 1. Ensure SVG, MathML, and HTML tags are recognized
  USE_PROFILES: { html: true, svg: true, svgFilters: true },

  // 2. Explicitly allow tags that Mermaid uses for labels
  ADD_TAGS: ["foreignObject", "div", "span", "br", "style"],

  // 3. Allow essential attributes for positioning and styling
  ADD_ATTR: ["target", "edgeLabel", "property", "ct-value"],
};

export function sanitizeHtml(html: string): string {
  const safeHtml = DOMPurify.sanitize(html, purifyConfigGeneral);
  return safeHtml;
}

export function sanitizeSvg(svg: string): string {
  const safeSvg = DOMPurify.sanitize(svg, purifyConfigMermaid);
  return safeSvg;
}
