import type { Tokens, TokenizerAndRendererExtension } from "marked";
import { escapeHtml } from "../utils/html-escape.js";
import { unescapeWikilinkTarget, WIKILINK_TARGET_CHAR_SOURCE } from "./wikilink-escape.js";
import { WIKILINK_TOKEN, type WikilinkToken } from "./wikilink-extension.types.js";

export const MARKDOWN_WIKILINK_CLASS = "note-wikilink";
export const MARKDOWN_WIKI_EMBED_CLASS = "note-wiki-embed";
export const MARKDOWN_WIKILINK_TARGET_ATTRIBUTE = "data-wikilink-target";

const OPEN_MARK = "[[";
const EMBED_PREFIX = "!";
/** The editor parser's target rule: one line, no bare bracket, the same escapes. */
const WIKILINK_PATTERN = new RegExp(String.raw`^(!?)\[\[(${WIKILINK_TARGET_CHAR_SOURCE}+)\]\]`);

export function isWikilinkToken(token: Tokens.Generic): token is WikilinkToken {
  return token.type === WIKILINK_TOKEN && typeof token.target === "string" && typeof token.isEmbed === "boolean";
}

/** Where a `[[` or `![[` could start, so the text tokenizer stops there. */
function findWikilinkStart(source: string): number | undefined {
  const index = source.indexOf(OPEN_MARK);

  if (index === -1) {
    return undefined;
  }

  return index > 0 && source[index - 1] === EMBED_PREFIX ? index - 1 : index;
}

function tokenizeWikilink(source: string): WikilinkToken | undefined {
  const match = source.match(WIKILINK_PATTERN);
  const target = match ? unescapeWikilinkTarget(match[2].trim()) : "";

  if (!match || !target) {
    return undefined;
  }

  return { type: WIKILINK_TOKEN, raw: match[0], target, isEmbed: match[1] === EMBED_PREFIX };
}

/** Placeholders a renderer resolves against the notes tree once the sanitized HTML is on the page. */
function renderWikilink(token: Tokens.Generic): string {
  if (!isWikilinkToken(token)) {
    return escapeHtml(token.raw);
  }

  const target = escapeHtml(token.target);

  return token.isEmbed
    ? `<span class="${MARKDOWN_WIKI_EMBED_CLASS}" ${MARKDOWN_WIKILINK_TARGET_ATTRIBUTE}="${target}"></span>`
    : `<span class="${MARKDOWN_WIKILINK_CLASS}" ${MARKDOWN_WIKILINK_TARGET_ATTRIBUTE}="${target}">${target}</span>`;
}

/** Inline: `[[target]]` and `![[target]]`, with the `\[`, `\]` and `\\` escapes. */
export const wikilinkExtension: TokenizerAndRendererExtension = {
  name: WIKILINK_TOKEN,
  level: "inline",
  start: findWikilinkStart,
  tokenizer: tokenizeWikilink,
  renderer: renderWikilink,
};
