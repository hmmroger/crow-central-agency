import { describe, expect, it } from "vitest";
import { Marked, type Token } from "marked";
import {
  MARKDOWN_WIKI_EMBED_CLASS,
  MARKDOWN_WIKILINK_CLASS,
  MARKDOWN_WIKILINK_TARGET_ATTRIBUTE,
  wikilinkExtension,
} from "./wikilink-extension.js";
import { WIKILINK_TOKEN, type WikilinkToken } from "./wikilink-extension.types.js";

const markedInstance = new Marked({ extensions: [wikilinkExtension] });

function isWikilinkToken(token: Token): token is WikilinkToken {
  return token.type === WIKILINK_TOKEN;
}

function findWikilinks(source: string): WikilinkToken[] {
  const wikilinks: WikilinkToken[] = [];

  markedInstance.walkTokens(markedInstance.lexer(source), (token) => {
    if (isWikilinkToken(token)) {
      wikilinks.push(token);
    }
  });

  return wikilinks;
}

function readTargets(source: string): string[] {
  return findWikilinks(source).map((wikilink) => wikilink.target);
}

describe("wikilinkExtension", () => {
  it("reads links and embeds with their trimmed targets", () => {
    expect(findWikilinks("See [[ trip/Plan ]] and ![[photo.png]]")).toEqual([
      { type: WIKILINK_TOKEN, raw: "[[ trip/Plan ]]", target: "trip/Plan", isEmbed: false },
      { type: WIKILINK_TOKEN, raw: "![[photo.png]]", target: "photo.png", isEmbed: true },
    ]);
  });

  it("undoes the \\[ \\] \\\\ escapes and keeps any other backslash literal", () => {
    expect(readTargets(String.raw`[[My \[draft\]]] [[a\\b]] [[C:\temp]]`)).toEqual(["My [draft]", "a\\b", "C:\\temp"]);
  });

  it("leaves blank targets, bare brackets and split lines as text", () => {
    expect(readTargets("[[ ]] [[a[b]] [[a\nb]]")).toEqual([]);
  });

  it("renders links and embeds as placeholders carrying their targets", () => {
    expect(markedInstance.parse("[[Plan]] ![[photo.png]]", { async: false })).toBe(
      `<p><span class="${MARKDOWN_WIKILINK_CLASS}" ${MARKDOWN_WIKILINK_TARGET_ATTRIBUTE}="Plan">Plan</span> ` +
        `<span class="${MARKDOWN_WIKI_EMBED_CLASS}" ${MARKDOWN_WIKILINK_TARGET_ATTRIBUTE}="photo.png"></span></p>\n`
    );
  });

  it("escapes the target it writes into the placeholder", () => {
    const html = markedInstance.parse('[[<img src=x onerror="alert(1)">]]', { async: false });

    expect(html).not.toContain("<img");
    expect(html).toContain(`${MARKDOWN_WIKILINK_TARGET_ATTRIBUTE}="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"`);
  });
});
