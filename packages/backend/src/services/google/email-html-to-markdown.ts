import { NodeHtmlMarkdown } from "node-html-markdown";
import { sanitizeEmailHtml } from "../../utils/html-sanitizer.js";
import { getAnchorCustomTranslator } from "../../utils/nhm-extensions/anchor-custom-translator.js";
import { getTableCustomTranslator } from "../../utils/nhm-extensions/table-custom-translator.js";

const nhm = new NodeHtmlMarkdown(
  {
    bulletMarker: "-",
    useInlineLinks: true,
  },
  {
    ...getTableCustomTranslator(),
    ...getAnchorCustomTranslator(),
  }
);

export function htmlToMarkdown(html: string): string {
  return nhm.translate(sanitizeEmailHtml(html));
}

/**
 * Wrap plain text into HTML paragraphs (split on blank lines, single newlines
 * become `<br>`), HTML-escaping along the way. Use before {@link htmlToMarkdown}
 * to render plain-text content through the same pipeline as HTML.
 */
export function plainTextToHtmlParagraphs(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const escaped = paragraph.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const withBreaks = escaped.replace(/\n/g, "<br>");
      return `<p>${withBreaks}</p>`;
    })
    .join("");
}
