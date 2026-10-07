import { describe, expect, it } from "vitest";
import { Marked, type Token } from "marked";
import { hashtagExtension, MARKDOWN_TAG_CLASS, taglineExtension } from "./tag-extension.js";
import { TAG_TOKEN, type TagLineToken } from "./tag-extension.types.js";

const markedInstance = new Marked({ extensions: [taglineExtension, hashtagExtension] });

function isTagLineToken(token: Token): token is TagLineToken {
  return token.type === TAG_TOKEN.TAGLINE;
}

function findTaglines(source: string): TagLineToken[] {
  return markedInstance.lexer(source).filter(isTagLineToken);
}

function readTags(source: string): string[] {
  return findTaglines(source).flatMap((tagline) => tagline.tokens.map((hashtag) => hashtag.text));
}

describe("marked tag extension", () => {
  describe("tagline tokenization", () => {
    it("should produce tagline token for tags at end of content", () => {
      expect(findTaglines("Hello\n\n#tag1")).toHaveLength(1);
    });

    it("should produce hashtag child tokens inside tagline", () => {
      const [tagline] = findTaglines("Hello\n\n#tag1 #tag2");

      expect(tagline.tokens).toEqual([
        { type: TAG_TOKEN.HASHTAG, raw: "#tag1", text: "tag1" },
        { type: TAG_TOKEN.HASHTAG, raw: "#tag2", text: "tag2" },
      ]);
    });

    it("should handle multiple tag lines", () => {
      expect(findTaglines("Hello\n\n#tag1\n#tag2 #tag3")).toHaveLength(1);
      expect(readTags("Hello\n\n#tag1\n#tag2 #tag3")).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should handle multiple tag lines with empty lines in between", () => {
      expect(findTaglines("Hello\n\n#tag1\n#tag2 #tag3\n\n#tag4")).toHaveLength(1);
      expect(readTags("Hello\n\n#tag1\n#tag2 #tag3\n\n#tag4")).toEqual(["tag1", "tag2", "tag3", "tag4"]);
    });

    it("should handle tags-only content (no preceding text)", () => {
      expect(readTags("#tag1 #tag2")).toEqual(["tag1", "tag2"]);
    });

    it("should accept tags in any script alongside ASCII tags", () => {
      expect(readTags("Hello\n\n#startup #日本 #café #हिन्दी #한국어_2")).toEqual([
        "startup",
        "日本",
        "café",
        "हिन्दी",
        "한국어_2",
      ]);
    });
  });

  describe("mid-document tag rejection", () => {
    it("should NOT produce tagline for tag-like line followed by content", () => {
      expect(findTaglines("#nottag\nSome text after")).toHaveLength(0);
    });

    it("should NOT produce tagline for tag-like line in middle of document", () => {
      const source = "## Hi\n#nottag\nSome text\n\n#tag1\n#tag2 #tag3";

      expect(findTaglines(source)).toHaveLength(1);
      expect(readTags(source)).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should NOT produce tagline when content follows after tag line", () => {
      expect(findTaglines("#tag1\n\nMore content here")).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle tags with trailing whitespace before EOF", () => {
      expect(findTaglines("Hello\n\n#tag1 #tag2  \n")).toHaveLength(1);
    });

    it("should handle underscores in tag names", () => {
      expect(readTags("#my_tag #another_one")).toEqual(["my_tag", "another_one"]);
    });

    it("should handle numeric tag names", () => {
      expect(readTags("#123 #v2")).toEqual(["123", "v2"]);
    });

    it("should not match heading syntax as tagline", () => {
      expect(findTaglines("## Heading\n\nSome content")).toHaveLength(0);
    });

    it("should not match more than 1 hash as tagline", () => {
      expect(findTaglines("Test content\n\n##nottag")).toHaveLength(0);
    });

    // A block extension sees a quote's inner text as a whole input, so unlike the editor's parser, which only
    // takes tags at the document's top level, marked tags the end of a quote.
    it("tags a blockquote that ends in a tag line, wherever the quote sits", () => {
      expect(findTaglines("Text\n\n> quote\n> #tag")).toHaveLength(0);
      expect(markedInstance.parse("Text\n\n> quote\n> #tag\n\nAfter", { async: false })).toContain(
        `<span class="${MARKDOWN_TAG_CLASS}">#tag</span>`
      );
    });
  });

  it("renders a tagline as a paragraph of tags", () => {
    expect(markedInstance.parse("#tag1 #tag2", { async: false })).toBe(
      `<p><span class="${MARKDOWN_TAG_CLASS}">#tag1</span><span class="${MARKDOWN_TAG_CLASS}">#tag2</span></p>`
    );
  });
});
