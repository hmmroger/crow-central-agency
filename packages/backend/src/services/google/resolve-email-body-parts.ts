import { markdownToHtml } from "../../utils/markdown-to-html.js";
import { sanitizeHtml } from "../../utils/html-sanitizer.js";
import { htmlToMarkdown } from "./html-to-markdown.js";
import { EMAIL_BODY_FORMAT, type EmailBodyFormat } from "./google-client.types.js";

/**
 * Resolve an outbound email body into the plain-text and HTML parts of a
 * multipart/alternative message. Markdown (the default) is rendered to HTML;
 * raw HTML is sanitized and down-converted for the plain-text alternative.
 */
export function resolveEmailBodyParts(body: string, format: EmailBodyFormat): { plainText: string; html: string } {
  if (format === EMAIL_BODY_FORMAT.HTML) {
    return { plainText: htmlToMarkdown(body, true), html: sanitizeHtml(body) };
  }

  return { plainText: body, html: markdownToHtml(body) };
}
