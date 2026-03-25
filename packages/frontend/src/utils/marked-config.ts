import { marked, type TokenizerAndRendererExtension } from "marked";
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

// Configure marked with GFM
marked.use({
  gfm: true,
  breaks: true,
  extensions: [mermaidExtension],
});

/**
 * Parse markdown content to sanitized HTML
 */
export function parseMarkdown(content: string): string {
  const html = marked.parse(content, { async: false });
  return sanitizeHtml(html);
}
