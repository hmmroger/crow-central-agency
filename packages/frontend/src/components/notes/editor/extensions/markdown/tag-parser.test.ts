import { describe, expect, it } from "vitest";
import { parser } from "@lezer/markdown";
import { TagParser } from "./tag-parser.js";

interface ParsedSyntaxNode {
  name: string;
  from: number;
  to: number;
}

const tagParser = parser.configure(TagParser);

function collectSyntaxNodes(input: string): ParsedSyntaxNode[] {
  const cursor = tagParser.parse(input).cursor();
  const syntaxNodes: ParsedSyntaxNode[] = [];

  do {
    syntaxNodes.push({ name: cursor.name, from: cursor.from, to: cursor.to });
  } while (cursor.next());

  return syntaxNodes;
}

function findSyntaxNodes(input: string, name: string): ParsedSyntaxNode[] {
  return collectSyntaxNodes(input).filter((syntaxNode) => syntaxNode.name === name);
}

describe("tag parser", () => {
  describe("tag line tokenization", () => {
    it("produces a TagLine for tags at the end of the content", () => {
      expect(findSyntaxNodes("Hello\n\n#tag1", "TagLine")).toHaveLength(1);
    });

    it("produces a Tag and a one-character TagMark per tag", () => {
      const tags = findSyntaxNodes("Hello\n\n#tag1 #tag2", "Tag");
      const marks = findSyntaxNodes("Hello\n\n#tag1 #tag2", "TagMark");

      expect(tags).toHaveLength(2);
      expect(marks).toHaveLength(2);
      expect(marks[0].to - marks[0].from).toBe(1);
      expect(marks[1].to - marks[1].from).toBe(1);
    });

    it("captures the tag positions", () => {
      const input = "Hello\n\n#tag1 #tag2";
      const tags = findSyntaxNodes(input, "Tag");

      expect(tags).toHaveLength(2);
      expect(input.slice(tags[0].from, tags[0].to)).toBe("#tag1");
      expect(input.slice(tags[1].from, tags[1].to)).toBe("#tag2");
    });

    it("accumulates consecutive tag lines", () => {
      expect(findSyntaxNodes("Hello\n\n#tag1\n#tag2 #tag3", "Tag")).toHaveLength(3);
    });

    it("parses a note that holds only tags", () => {
      expect(findSyntaxNodes("#tag1 #tag2", "TagLine")).toHaveLength(1);
      expect(findSyntaxNodes("#tag1 #tag2", "Tag")).toHaveLength(2);
    });
  });

  describe("mid-document rejection", () => {
    it("rejects a tag-like line followed by text", () => {
      expect(findSyntaxNodes("#nottag\nSome text after", "TagLine")).toHaveLength(0);
    });

    it("keeps only the trailing tag lines", () => {
      const input = "## Hi\n#nottag\nSome text\n\n#tag1\n#tag2 #tag3";

      expect(findSyntaxNodes(input, "TagLine")).toHaveLength(1);
      expect(findSyntaxNodes(input, "Tag")).toHaveLength(3);
    });

    it("rejects tags followed by content after a blank line", () => {
      expect(findSyntaxNodes("#tag1\n\nMore content here", "TagLine")).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("accepts underscores in tag names", () => {
      const input = "#my_tag #another_one";
      const tags = findSyntaxNodes(input, "Tag");

      expect(tags).toHaveLength(2);
      expect(input.slice(tags[0].from, tags[0].to)).toBe("#my_tag");
      expect(input.slice(tags[1].from, tags[1].to)).toBe("#another_one");
    });

    it("accepts numeric tag names", () => {
      const input = "#123 #v2";
      const tags = findSyntaxNodes(input, "Tag");

      expect(tags).toHaveLength(2);
      expect(input.slice(tags[0].from, tags[0].to)).toBe("#123");
      expect(input.slice(tags[1].from, tags[1].to)).toBe("#v2");
    });

    it("does not treat a heading as a tag line", () => {
      expect(findSyntaxNodes("## Heading\n\nSome content", "TagLine")).toHaveLength(0);
    });

    it("does not match inside a blockquote", () => {
      expect(findSyntaxNodes("> #tag1", "TagLine")).toHaveLength(0);
    });

    it("does not match more than one hash", () => {
      expect(findSyntaxNodes("Test content\n\n##nottag", "TagLine")).toHaveLength(0);
    });

    it("allows trailing whitespace before the end of the note", () => {
      expect(findSyntaxNodes("Hello\n\n#tag1 #tag2  \n", "TagLine")).toHaveLength(1);
    });

    it("splits tag lines separated by a blank line into separate TagLines", () => {
      const input = "Hello\n\n#tag1\n#tag2 #tag3\n\n#tag4";

      expect(findSyntaxNodes(input, "TagLine")).toHaveLength(2);
      expect(findSyntaxNodes(input, "Tag")).toHaveLength(4);
    });
  });
});
