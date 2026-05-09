import { Marked } from "marked";
import { sanitizeHtml } from "./html-sanitizer.js";

const converter = new Marked({
  gfm: true,
  breaks: true,
});

export function markdownToHtml(markdown: string): string {
  return sanitizeHtml(converter.parse(markdown, { async: false }));
}
