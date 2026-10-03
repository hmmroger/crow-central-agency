import { describe, expect, it } from "vitest";
import { GFM, parser } from "@lezer/markdown";
import { SYNTAX_NODE } from "../markdown-syntax.types.js";
import { WikilinkParser } from "./wikilink-parser.js";

const wikilinkParser = parser.configure([GFM, WikilinkParser]);

function findRanges(input: string, name: string): string[] {
  const cursor = wikilinkParser.parse(input).cursor();
  const ranges: string[] = [];

  do {
    if (cursor.name === name) {
      ranges.push(input.slice(cursor.from, cursor.to));
    }
  } while (cursor.next());

  return ranges;
}

describe("wikilink parser", () => {
  it("parses [[target]] into marks around the target", () => {
    const input = "See [[My note]] here";

    expect(findRanges(input, SYNTAX_NODE.WIKILINK)).toEqual(["[[My note]]"]);
    expect(findRanges(input, SYNTAX_NODE.WIKILINK_MARK)).toEqual(["[[", "]]"]);
    expect(findRanges(input, SYNTAX_NODE.WIKILINK_TARGET)).toEqual(["My note"]);
  });

  it("parses ![[target]] as an embed sharing the same marks and target", () => {
    const input = "![[trip/photo.png]]";

    expect(findRanges(input, SYNTAX_NODE.WIKI_EMBED)).toEqual([input]);
    expect(findRanges(input, SYNTAX_NODE.WIKILINK)).toEqual([]);
    expect(findRanges(input, SYNTAX_NODE.WIKILINK_MARK)).toEqual(["![[", "]]"]);
    expect(findRanges(input, SYNTAX_NODE.WIKILINK_TARGET)).toEqual(["trip/photo.png"]);
  });

  it("keeps escaped brackets inside the target", () => {
    expect(findRanges("[[My \\[draft\\] note]]", SYNTAX_NODE.WIKILINK_TARGET)).toEqual(["My \\[draft\\] note"]);
    expect(findRanges("[[ends with \\\\]]", SYNTAX_NODE.WIKILINK_TARGET)).toEqual(["ends with \\\\"]);
  });

  it("treats a backslash before any other character as literal", () => {
    expect(findRanges("[[C:\\temp\\notes]]", SYNTAX_NODE.WIKILINK_TARGET)).toEqual(["C:\\temp\\notes"]);
    expect(findRanges("[[a\\]]", SYNTAX_NODE.WIKILINK)).toEqual([]);
    expect(findRanges("[[a\\\\]]", SYNTAX_NODE.WIKILINK_TARGET)).toEqual(["a\\\\"]);
  });

  it("finds several links on one line", () => {
    expect(findRanges("[[a]] and ![[b.png]] and [[c]]", SYNTAX_NODE.WIKILINK_TARGET)).toEqual(["a", "b.png", "c"]);
  });

  it.each([
    ["an empty target", "[[]]"],
    ["a blank target", "[[   ]]"],
    ["an unescaped bracket", "[[a[b]]"],
    ["a line break", "[[a\nb]]"],
    ["a missing close mark", "[[a]"],
  ])("rejects %s", (_label, input) => {
    expect(findRanges(input, SYNTAX_NODE.WIKILINK)).toEqual([]);
  });

  it.each([
    ["a code span", "`[[a]] ![[b.png]]`"],
    ["fenced code", "```\n[[a]] ![[b.png]]\n```"],
    ["an indented code block", "    [[a]] ![[b.png]]"],
    ["an HTML block", "<div>\n[[a]] ![[b.png]]\n</div>"],
  ])("does not recognize a link or embed inside %s", (_label, input) => {
    expect(findRanges(input, SYNTAX_NODE.WIKILINK)).toEqual([]);
    expect(findRanges(input, SYNTAX_NODE.WIKI_EMBED)).toEqual([]);
  });

  it("parses a link inside a table cell", () => {
    const input = "| a | b |\n| - | - |\n| [[x]] | ![[y.png]] |";

    expect(findRanges(input, SYNTAX_NODE.WIKILINK)).toEqual(["[[x]]"]);
    expect(findRanges(input, SYNTAX_NODE.WIKI_EMBED)).toEqual(["![[y.png]]"]);
  });
});
