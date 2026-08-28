import { marked, Renderer, type Tokens, type TokenizerAndRendererExtension } from "marked";
import { sanitizeHtml } from "./html-sanitizer";

type MarkedRenderer = Renderer;
const renderDefaultTable = Renderer.prototype.table;

// `htmlview` (plus aliases) declares an agent-authored HTML embed. Bare `html`
// is intentionally excluded so genuine "show me this HTML source" listings keep
// rendering as escaped code.
const HTMLVIEW_LANGS = ["htmlview", "html-view", "htmlpreview", "html_view"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Custom code-block renderer covering mermaid diagrams and htmlview embeds.
const codeBlockExtension: TokenizerAndRendererExtension = {
  name: "code",
  level: "block",
  renderer(token) {
    if (token.lang === "mermaid") {
      return `<div class="mermaid-container">${token.text}</div>`;
    }

    // Emit the escaped source in light DOM; the shadow mount reads it back and
    // renders it in an isolated shadow root. The inner .htmlview-embed is the
    // shadow host, so host chrome can live as a sibling in .htmlview-container
    // and still render (a shadow host's own light children do not).
    if (HTMLVIEW_LANGS.includes(token.lang)) {
      return `<div class="htmlview-container"><div class="htmlview-embed"><pre class="htmlview-source">${escapeHtml(token.text)}</pre></div></div>`;
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

// Configure marked with GFM
marked.use({
  gfm: true,
  breaks: true,
  extensions: [codeBlockExtension],
  renderer,
});

/**
 * Parse markdown content to sanitized HTML
 */
export function parseMarkdown(content: string): string {
  const html = marked.parse(content, { async: false });
  return sanitizeHtml(html);
}
