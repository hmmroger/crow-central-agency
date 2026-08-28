import DOMPurify from "dompurify";

const HTTPS_PROTOCOL = "https:";
// Media elements whose src/srcset must be restricted to https inside embeds.
const EMBED_MEDIA_TAGS = ["IMG", "SOURCE", "VIDEO", "AUDIO"];
const BUTTON_SUBMIT_TYPE = "submit";

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

  HTML_INTEGRATION_POINTS: {
    "annotation-xml": true,
    foreignobject: true,
  },
};

/**
 * DOMPurify config for `htmlview` embeds rendered inside a shadow root.
 * A separate profile from the general markdown output: it allows scoped
 * `<style>` (safe because the shadow root isolates it) while forbidding the
 * phishing-shaped form controls, and drops any non-https media source.
 */
const purifyConfigEmbed = {
  USE_PROFILES: { html: true, svg: true },
  ADD_TAGS: ["style"],
  ADD_ATTR: ["target", "rel"],
  // link/base forbidden explicitly: <link> can issue an uncontrolled http
  // request and <base> can reroute the embed's relative URLs, neither of which
  // enforceHttpsMedia covers. No legitimate embed use for either.
  FORBID_TAGS: ["form", "input", "select", "textarea", "iframe", "link", "base"],
  FORBID_ATTR: ["onerror", "onclick", "onload"],
  // Parse in a body context so a leading <style> is retained rather than being
  // hoisted into (and dropped with) an implicit <head>.
  FORCE_BODY: true,
};

function forceSafeAnchor(node: Element): void {
  if (node.tagName === "A" && node.getAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === HTTPS_PROTOCOL;
  } catch {
    // Relative and protocol-relative ("//host") URLs throw without a base and
    // are rejected — embeds may only reference absolute https resources.
    return false;
  }
}

/**
 * Sanitize URL channels inside embed CSS (both `<style>` text and `style=`
 * attribute values): strip `@import` entirely and drop any `url()` whose scheme
 * is not https. Reuses isHttpsUrl so CSS and media attributes cannot drift.
 * Fails closed — a malformed `url(` leaves an unclosed function the browser
 * discards, and an unparseable candidate is dropped rather than kept.
 */
function sanitizeCssUrls(css: string): string {
  const withoutImports = css.replace(/@import\b[^;]*;?/gi, "");
  return withoutImports.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi,
    (match, doubleQuoted, singleQuoted, unquoted) => {
      const candidate = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
      return isHttpsUrl(candidate) ? match : "";
    }
  );
}

/**
 * Restrict embed media to https sources. Any `src`/`srcset` candidate whose
 * scheme is not https (including http, data, and protocol-relative) is dropped.
 */
function enforceHttpsMedia(node: Element): void {
  if (!EMBED_MEDIA_TAGS.includes(node.tagName)) {
    return;
  }

  const src = node.getAttribute("src");
  if (src !== null && !isHttpsUrl(src)) {
    node.removeAttribute("src");
  }

  const srcset = node.getAttribute("srcset");
  if (srcset !== null) {
    const keptCandidates = srcset
      .split(",")
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0 && isHttpsUrl(candidate.split(/\s+/)[0]));

    if (keptCandidates.length === 0) {
      node.removeAttribute("srcset");
    } else {
      node.setAttribute("srcset", keptCandidates.join(", "));
    }
  }
}

let anchorHookRegistered = false;

function ensureAnchorHook(): void {
  if (anchorHookRegistered) {
    return;
  }

  anchorHookRegistered = true;
  DOMPurify.addHook("afterSanitizeAttributes", forceSafeAnchor);
}

let embedPurify: typeof DOMPurify | undefined;

// Isolated DOMPurify instance so the embed-only media/button hooks never run
// against the general markdown path.
function getEmbedPurify(): typeof DOMPurify {
  if (embedPurify) {
    return embedPurify;
  }

  const instance = DOMPurify(window);
  // afterSanitizeElements is DOMPurify's documented node-removal hook: it runs
  // after the node is committed to the output tree, so removal is deterministic.
  instance.addHook("afterSanitizeElements", (node) => {
    if (!(node instanceof Element)) {
      return;
    }

    if (node.tagName === "BUTTON") {
      // A bare <button> defaults to type=submit; forbid the submit shape.
      const buttonType = (node.getAttribute("type") ?? BUTTON_SUBMIT_TYPE).toLowerCase();
      if (buttonType === BUTTON_SUBMIT_TYPE) {
        node.parentNode?.removeChild(node);
      }

      return;
    }

    if (node.tagName === "STYLE") {
      node.textContent = sanitizeCssUrls(node.textContent ?? "");
    }
  });
  instance.addHook("afterSanitizeAttributes", (node) => {
    forceSafeAnchor(node);
    enforceHttpsMedia(node);

    const styleAttr = node.getAttribute("style");
    if (styleAttr !== null) {
      const cleaned = sanitizeCssUrls(styleAttr);
      if (cleaned !== styleAttr) {
        node.setAttribute("style", cleaned);
      }
    }
  });

  embedPurify = instance;
  return embedPurify;
}

export function sanitizeHtml(html: string): string {
  ensureAnchorHook();
  const safeHtml = DOMPurify.sanitize(html, purifyConfigGeneral);
  return safeHtml;
}

export function sanitizeSvg(svg: string): string {
  const safeSvg = DOMPurify.sanitize(svg, purifyConfigMermaid);
  return safeSvg;
}

export function sanitizeEmbedHtml(html: string): string {
  return getEmbedPurify().sanitize(html, purifyConfigEmbed);
}
