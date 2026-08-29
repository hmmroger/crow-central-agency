import { sanitizeEmbedHtml } from "../../utils/html-sanitizer";
import HTMLVIEW_EMBED_STYLES from "./htmlview-embed.css?inline";

const SOURCE_CARRIER_SELECTOR = "template.htmlview-source";

// The source last rendered into each shadow root. Keyed on the ShadowRoot, which
// innerHTML does not serialize: a re-committed or remounted host gets a fresh
// element with no root and re-renders, and a changed source replaces stale
// content — so "shadow content matches current source" is the mount invariant.
const renderedSourceByShadow = new WeakMap<ShadowRoot, string>();

// The authored source travels in an inert <template>: not rendered, no layout,
// no selection or a11y text, yet still serialized by innerHTML.
export function readEmbedSource(host: Element): string {
  const template = host.querySelector<HTMLTemplateElement>(SOURCE_CARRIER_SELECTOR);
  return template?.content.textContent ?? "";
}

export function renderEmbedIntoHost(host: HTMLElement, source: string): void {
  if (!source.trim()) {
    return;
  }

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (renderedSourceByShadow.get(shadow) === source) {
    return;
  }

  const baseStyle = document.createElement("style");
  baseStyle.textContent = HTMLVIEW_EMBED_STYLES;

  // Content is DOMPurify-sanitized; parse and import the nodes so we never assign
  // a markup string to innerHTML. A leading <style> is hoisted into <head> by the
  // parser, so import head nodes before body — otherwise a scoped author
  // stylesheet at the top of the embed is dropped. The base sheet stays the
  // shadow root's first child so an embed's own <style> outranks it.
  const parsed = new DOMParser().parseFromString(sanitizeEmbedHtml(source), "text/html");
  const embedNodes = Array.from(parsed.head.childNodes).concat(Array.from(parsed.body.childNodes));

  shadow.replaceChildren(baseStyle);
  embedNodes.forEach((node) => shadow.appendChild(document.importNode(node, true)));
  renderedSourceByShadow.set(shadow, source);
}
