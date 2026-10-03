import { Marked, Renderer, type Tokens, type TokenizerAndRendererExtension } from "marked";
import { sanitizeHtml } from "./html-sanitizer";
import {
  escapeHtml,
  hashtagExtension,
  HTMLVIEW_FENCE_LANG,
  MARKDOWN_WIKILINK_TARGET_ATTRIBUTE,
  taglineExtension,
  wikilinkExtension,
} from "@crow-central-agency/shared";

type MarkedRenderer = Renderer;
const renderDefaultTable = Renderer.prototype.table;

// Custom code-block renderer covering mermaid diagrams and htmlview embeds.
const codeBlockExtension: TokenizerAndRendererExtension = {
  name: "code",
  level: "block",
  renderer(token) {
    if (token.lang === "mermaid") {
      return `<div class="mermaid-container">${token.text}</div>`;
    }

    if (token.lang === HTMLVIEW_FENCE_LANG) {
      return `<div class="htmlview-container"><div class="htmlview-embed"><template class="htmlview-source">${escapeHtml(token.text)}</template></div></div>`;
    }

    // Fall back to default renderer for other code blocks
    return false;
  },
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Custom renderers: wrap tables in a scroll container; open links in a new tab
const renderer = {
  table(this: MarkedRenderer, token: Tokens.Table): string {
    return `<div class="markdown-table-scroll">${renderDefaultTable.call(this, token)}</div>`;
  },

  link(
    this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } },
    { href, title, tokens }: Tokens.Link
  ): string {
    const text = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
    return `<a href="${escapeAttr(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  },
};

const markedInstance = new Marked({
  gfm: true,
  breaks: true,
  extensions: [codeBlockExtension, taglineExtension, hashtagExtension, wikilinkExtension],
  renderer,
});

/**
 * Parse markdown content to sanitized HTML
 */
export function parseMarkdown(content: string): string {
  const html = markedInstance.parse(content, { async: false });
  return sanitizeHtml(html);
}

/** Whether parsed HTML holds a wikilink or embed, so rendering it needs the notes tree. */
export function hasNoteLinks(html: string): boolean {
  return html.includes(MARKDOWN_WIKILINK_TARGET_ATTRIBUTE);
}
