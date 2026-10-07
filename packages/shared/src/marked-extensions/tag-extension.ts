import type { RendererThis, Token, Tokens, TokenizerAndRendererExtension } from "marked";
import { TAG_TOKEN, type HashtagToken, type TagLineToken } from "./tag-extension.types.js";

/** Regex source of one tag: letters, numbers and marks of any script, or `_`. Needs the `u` flag. */
export const TAG_SOURCE = String.raw`#[\p{L}\p{N}\p{M}_]+`;
/** Regex source of one line of tags */
export const TAG_LINE_SOURCE = `(?:${TAG_SOURCE}[ \t]*)+`;
/** The class a rendered tag carries */
export const MARKDOWN_TAG_CLASS = "md-tag";

// One or more tag lines, blank lines allowed between them, followed only by whitespace until the end. start()
// checks it too, so a tag-like line mid-document never reaches the tokenizer.
const TAG_LINES_AT_END_SOURCE = String.raw`^((?:[ \t]*\n)*${TAG_LINE_SOURCE}(?:\n|$))+\s*$`;
const TAG_LINES_AT_END_START_PATTERN = new RegExp(TAG_LINES_AT_END_SOURCE, "mu");
const TAG_LINES_AT_END_PATTERN = new RegExp(TAG_LINES_AT_END_SOURCE, "u");
const TAG_PATTERN = new RegExp(TAG_SOURCE, "gu");
const HASHES_ONLY_PATTERN = /^#+$/;
const TAG_MARK_LENGTH = 1;

function isHashtagToken(token: Tokens.Generic): token is HashtagToken {
  return token.type === TAG_TOKEN.HASHTAG && typeof token.text === "string";
}

/** marked's heading rule splits `##word` into a paragraph of `#` and a remaining `#word`, which is not a tag. */
function followsHeadingSplit(previousTokens: Token[]): boolean {
  const previous = previousTokens[previousTokens.length - 1];

  return previous?.type === "paragraph" && HASHES_ONLY_PATTERN.test(previous.text);
}

function toHashtagToken(tag: string): HashtagToken {
  return { type: TAG_TOKEN.HASHTAG, raw: tag, text: tag.slice(TAG_MARK_LENGTH) };
}

/** Block-level: tag lines at the end of the input become a tagline holding its hashtags. */
export const taglineExtension: TokenizerAndRendererExtension = {
  name: TAG_TOKEN.TAGLINE,
  level: "block",
  childTokens: ["tokens"],
  start(source) {
    return source.match(TAG_LINES_AT_END_START_PATTERN)?.index;
  },
  tokenizer(source, previousTokens): TagLineToken | undefined {
    const match = source.match(TAG_LINES_AT_END_PATTERN);

    if (!match || followsHeadingSplit(previousTokens)) {
      return undefined;
    }

    return {
      type: TAG_TOKEN.TAGLINE,
      raw: match[0],
      tokens: Array.from(match[0].matchAll(TAG_PATTERN), (tagMatch) => toHashtagToken(tagMatch[0])),
    };
  },
  renderer(this: RendererThis, token) {
    return `<p>${this.parser.parseInline(token.tokens ?? [])}</p>`;
  },
};

/** Renders the hashtags a tagline holds; the tokenizer never matches, since only a tagline makes hashtags. */
export const hashtagExtension: TokenizerAndRendererExtension = {
  name: TAG_TOKEN.HASHTAG,
  level: "inline",
  tokenizer() {
    return undefined;
  },
  renderer(token) {
    // The text is only letters, numbers, marks and `_`, so it needs no escaping.
    return isHashtagToken(token) ? `<span class="${MARKDOWN_TAG_CLASS}">#${token.text}</span>` : false;
  },
};
