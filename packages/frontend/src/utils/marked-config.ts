import { marked, type Tokens, type TokenizerAndRendererExtension } from "marked";
import { sanitizeHtml } from "./html-sanitizer";

const mermaidExtension: TokenizerAndRendererExtension = {
  name: "code",
  level: "block",
  renderer(token) {
    // Only customize rendering for mermaid code blocks
    if (token.lang === "mermaid") {
      return `<div class="mermaid-container">${token.text}</div>`;
    }

    // Fall back to default renderer for other code blocks
    return false;
  },
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Custom renderer to open all links in a new tab
const renderer = {
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
  extensions: [mermaidExtension],
  renderer,
});

/**
 * Parse markdown content to sanitized HTML
 */
export function parseMarkdown(content: string): string {
  const html = marked.parse(content, { async: false });
  return sanitizeHtml(html);
}
