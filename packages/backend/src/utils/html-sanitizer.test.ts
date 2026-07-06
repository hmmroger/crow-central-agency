import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeEmailHtml } from "./html-sanitizer.js";

describe("sanitizeHtml", () => {
  it("preserves safe markup", () => {
    const result = sanitizeHtml("<p>Hello <strong>world</strong></p>");

    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
    expect(result).toContain("world");
  });

  it("removes script tags", () => {
    const result = sanitizeHtml('<p>ok</p><script>alert("xss")</script>');

    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("ok");
  });

  it("strips dangerous event-handler attributes but keeps the element", () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)"><button onclick="steal()">go</button>');

    expect(result).not.toContain("onerror");
    expect(result).not.toContain("onclick");
    expect(result).toContain("go");
  });

  it("neutralizes javascript: URLs in links", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');

    expect(result).not.toContain("javascript:");
    expect(result).toContain("click");
  });

  it("keeps http(s) links and their content intact", () => {
    const result = sanitizeHtml('<a href="https://example.com">example</a>');

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("example");
  });

  it("keeps table layout tags for general (non-email) content", () => {
    const result = sanitizeHtml("<table><tr><td>cell</td></tr></table>");

    expect(result).toContain("<table");
    expect(result).toContain("cell");
  });
});

describe("sanitizeEmailHtml", () => {
  it("flattens table layout, keeping cell content separated by line breaks", () => {
    const result = sanitizeEmailHtml("<table><tbody><tr><td>Cell1</td><td>Cell2</td></tr></tbody></table>");

    expect(result).not.toContain("<table");
    expect(result).not.toContain("<td");
    expect(result).toContain("Cell1");
    expect(result).toContain("Cell2");
    expect(result).toContain("<br");
  });

  it("replaces images with their alt text", () => {
    const result = sanitizeEmailHtml('<p><img src="https://example.com/logo.png" alt="Company Logo"></p>');

    expect(result).not.toContain("<img");
    expect(result).toContain("Company Logo");
  });

  it("replaces images without alt text with an empty string", () => {
    const result = sanitizeEmailHtml('<p>before<img src="https://example.com/logo.png">after</p>');

    expect(result).not.toContain("<img");
    expect(result).toContain("before");
    expect(result).toContain("after");
  });

  it("still removes script tags", () => {
    const result = sanitizeEmailHtml('<p>ok</p><script>alert("xss")</script>');

    expect(result).not.toContain("<script");
    expect(result).toContain("ok");
  });
});

describe("inline CSS handling", () => {
  it("preserves benign inline style attributes", () => {
    const input = '<p style="color:red;font-size:20px">styled</p>';

    expect(sanitizeHtml(input)).toContain('style="color:red;font-size:20px"');
    expect(sanitizeEmailHtml(input)).toContain('style="color:red;font-size:20px"');
  });

  it("removes <style> blocks along with their CSS content", () => {
    const input = "<style>.leak{color:red}</style><p>content</p>";

    for (const result of [sanitizeHtml(input), sanitizeEmailHtml(input)]) {
      expect(result).not.toContain("<style");
      expect(result).not.toContain("color:red");
      expect(result).toContain("content");
    }
  });

  it("sanitizes inline CSS identically across the general and email sanitizers", () => {
    const input = '<div style="margin:0;padding:8px;background-image:url(https://example.com/bg.png)">box</div>';

    expect(sanitizeEmailHtml(input)).toBe(sanitizeHtml(input));
  });
});
