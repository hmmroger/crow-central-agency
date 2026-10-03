// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  convertHtmlToMarkdown as convertSanitizedHtml,
  hasMarkdownStructure,
  sanitizePastedHtml,
} from "./html-to-markdown.js";

function convertHtmlToMarkdown(html: string): string {
  return convertSanitizedHtml(sanitizePastedHtml(html));
}

function isStructured(html: string): boolean {
  return hasMarkdownStructure(sanitizePastedHtml(html));
}

describe("hasMarkdownStructure", () => {
  it("treats a code editor's highlighted copy as styling only", () => {
    const vsCodeHtml =
      '<div style="color: #ccc;"><div><span style="color: #569cd6;"># Title</span></div><br>' +
      '<div><span style="color: #ce9178;">- item</span></div></div>';

    expect(isStructured(vsCodeHtml)).toBe(false);
  });

  it("treats headings, lists and links as structure", () => {
    expect(isStructured("<h2>Title</h2>")).toBe(true);
    expect(isStructured("<ul><li>item</li></ul>")).toBe(true);
    expect(isStructured('<span><a href="https://example.com">docs</a></span>')).toBe(true);
  });

  it("does not count a link whose scheme the sanitizer strips", () => {
    expect(isStructured('<div><a href="javascript:alert(1)">click</a></div>')).toBe(false);
  });
});

describe("convertHtmlToMarkdown", () => {
  it("converts formatting to markdown", () => {
    expect(convertHtmlToMarkdown("<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em></p>")).toBe(
      "## Title\n\nSome **bold** and _italic_"
    );
  });

  it("writes a link whose text differs from its URL inline", () => {
    expect(convertHtmlToMarkdown('<a href="https://example.com/docs">the docs</a>')).toBe(
      "[the docs](https://example.com/docs)"
    );
  });

  it("writes a link whose text is its URL as an autolink", () => {
    expect(convertHtmlToMarkdown('<a href="https://example.com">https://example.com</a>')).toBe(
      "<https://example.com>"
    );
  });

  it("encodes characters that would break the link destination", () => {
    expect(convertHtmlToMarkdown('<a href="https://example.com/a_(b)*">text</a>')).toBe(
      "[text](https://example.com/a%5F%28b%29%2A)"
    );
  });

  it("escapes quotes inside a link title", () => {
    expect(convertHtmlToMarkdown(`<a href="https://example.com" title='Say "hi"'>text</a>`)).toBe(
      '[text](https://example.com "Say \\"hi\\"")'
    );
  });

  it("drops script links but keeps their text", () => {
    expect(convertHtmlToMarkdown('<a href="javascript:alert(1)">click</a>')).toBe("click");
  });

  it("drops relative links but keeps their text", () => {
    expect(convertHtmlToMarkdown('<a href="/notes/other">other</a>')).toBe("other");
  });

  it("drops a link with no visible text", () => {
    const zeroWidthSpace = String.fromCharCode(0x200b);

    expect(convertHtmlToMarkdown(`before <a href="https://example.com">${zeroWidthSpace}</a> after`)).not.toContain(
      "example.com"
    );
  });

  it("removes script elements", () => {
    expect(convertHtmlToMarkdown("<p>safe</p><script>alert(1)</script>")).toBe("safe");
  });
});
