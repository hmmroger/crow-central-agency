// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./marked-config";

describe("parseMarkdown", () => {
  it("returns the distinct wikilink and embed targets, sorted and unescaped", () => {
    const { wikilinkTargets } = parseMarkdown(
      "See [[trip/Plan]] and ![[photo.png]].\n\n- [[Spec \\[draft\\]]]\n- again [[trip/Plan]]"
    );

    expect(wikilinkTargets).toEqual(["Spec [draft]", "photo.png", "trip/Plan"]);
  });

  it("collects targets inside tables and nested blocks", () => {
    const { wikilinkTargets } = parseMarkdown("> quote [[Quoted]]\n\n| a |\n| - |\n| [[Cell]] |");

    expect(wikilinkTargets).toEqual(["Cell", "Quoted"]);
  });

  it("ignores wikilink syntax inside code", () => {
    const { wikilinkTargets } = parseMarkdown("`[[Inline]]`\n\n```\n[[Fenced]]\n```");

    expect(wikilinkTargets).toEqual([]);
  });

  it("still renders the wikilink placeholders", () => {
    expect(parseMarkdown("[[Plan]]").html).toContain('data-wikilink-target="Plan"');
  });
});
