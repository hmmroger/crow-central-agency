import { describe, expect, it } from "vitest";
import type { TranslatorConfig, TranslatorContext } from "node-html-markdown";
import { getAnchorCustomTranslator } from "./anchor-custom-translator.js";

interface AnchorAttributes {
  href?: string;
  title?: string;
  text: string;
}

// ElementNode and Visitor carry parser internals and private members, so a structural stub needs a cast.
function createContext({ href, title, text }: AnchorAttributes): TranslatorContext {
  const attributes = new Map<string, string | undefined>([
    ["href", href],
    ["title", title],
  ]);

  return {
    node: { getAttribute: (name: string) => attributes.get(name), textContent: text },
    visitor: { instance: { aTagTranslators: {} } },
    options: {},
    nodeMetadata: new Map(),
  } as unknown as TranslatorContext;
}

function translate(attributes: AnchorAttributes): TranslatorConfig {
  const anchorTranslator = getAnchorCustomTranslator().a;
  return typeof anchorTranslator === "function" ? anchorTranslator(createContext(attributes)) : anchorTranslator;
}

function getPostfix(title?: string): string | undefined {
  return translate({ href: "https://example.com", title, text: "Example" }).postfix;
}

describe("getAnchorCustomTranslator", () => {
  it("omits the title when none is set", () => {
    expect(getPostfix()).toBe("](https://example.com)");
  });

  it("escapes quotes in the title", () => {
    expect(getPostfix('Say "hi"')).toBe('](https://example.com "Say \\"hi\\"")');
  });

  it("escapes a backslash before a quote so the title stays closed", () => {
    expect(getPostfix('a\\" ![x](https://evil.example/x.png)')).toBe(
      '](https://example.com "a\\\\\\" ![x](https://evil.example/x.png)")'
    );
  });

  it("escapes a trailing backslash", () => {
    expect(getPostfix("path\\")).toBe('](https://example.com "path\\\\")');
  });

  it("collapses line breaks in the title to a single space", () => {
    expect(getPostfix("first\n\nsecond\r\nthird")).toBe('](https://example.com "first second third")');
  });

  it("renders an autolink when the text is the href", () => {
    expect(translate({ href: "https://example.com", text: "https://example.com" }).content).toBe(
      "<https://example.com>"
    );
  });
});
