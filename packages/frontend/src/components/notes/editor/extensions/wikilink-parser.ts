import type { InlineContext, InlineParser, MarkdownConfig } from "@lezer/markdown";
import { isEscapableWikilinkChar } from "@crow-central-agency/shared";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";

const EXCLAMATION_CODE = 33;
const OPEN_BRACKET_CODE = 91;
const BACKSLASH_CODE = 92;
const CLOSE_BRACKET_CODE = 93;
const NEWLINE_CODE = 10;
const LINK_OPEN_MARK_LENGTH = 2;
const EMBED_OPEN_MARK_LENGTH = 3;
const CLOSE_MARK_LENGTH = 2;

/** Position of the closing `]]`, or -1 when the target is blank, crosses a line or holds an unescaped bracket. */
function findCloseMark(cx: InlineContext, targetFrom: number): number {
  for (let position = targetFrom; position < cx.end; position++) {
    const code = cx.char(position);

    if (code === BACKSLASH_CODE && isEscapableWikilinkChar(cx.slice(position + 1, position + 2))) {
      position++;
      continue;
    }

    if (code === CLOSE_BRACKET_CODE && cx.char(position + 1) === CLOSE_BRACKET_CODE) {
      return cx.slice(targetFrom, position).trim() ? position : -1;
    }

    if (code === OPEN_BRACKET_CODE || code === CLOSE_BRACKET_CODE || code === NEWLINE_CODE) {
      return -1;
    }
  }

  return -1;
}

function parseWikilink(cx: InlineContext, name: string, position: number, openMarkLength: number): number {
  const targetFrom = position + openMarkLength;
  const targetTo = findCloseMark(cx, targetFrom);

  if (targetTo === -1) {
    return -1;
  }

  const to = targetTo + CLOSE_MARK_LENGTH;

  return cx.addElement(
    cx.elt(name, position, to, [
      cx.elt(SYNTAX_NODE.WIKILINK_MARK, position, targetFrom),
      cx.elt(SYNTAX_NODE.WIKILINK_TARGET, targetFrom, targetTo),
      cx.elt(SYNTAX_NODE.WIKILINK_MARK, targetTo, to),
    ])
  );
}

const wikilinkParser: InlineParser = {
  name: SYNTAX_NODE.WIKILINK,
  // `[` would otherwise start a standard link.
  before: "Link",
  parse(cx, next, position) {
    if (next !== OPEN_BRACKET_CODE || cx.char(position + 1) !== OPEN_BRACKET_CODE) {
      return -1;
    }

    return parseWikilink(cx, SYNTAX_NODE.WIKILINK, position, LINK_OPEN_MARK_LENGTH);
  },
};

const wikiEmbedParser: InlineParser = {
  name: SYNTAX_NODE.WIKI_EMBED,
  // `![` would otherwise start a standard image.
  before: "Image",
  parse(cx, next, position) {
    if (
      next !== EXCLAMATION_CODE ||
      cx.char(position + 1) !== OPEN_BRACKET_CODE ||
      cx.char(position + 2) !== OPEN_BRACKET_CODE
    ) {
      return -1;
    }

    return parseWikilink(cx, SYNTAX_NODE.WIKI_EMBED, position, EMBED_OPEN_MARK_LENGTH);
  },
};

/**
 * Parses `[[target]]` into `Wikilink` and `![[target]]` into `WikiEmbed`, each holding
 * `WikilinkMark, WikilinkTarget, WikilinkMark`.
 */
export const WikilinkParser: MarkdownConfig = {
  defineNodes: [SYNTAX_NODE.WIKILINK, SYNTAX_NODE.WIKI_EMBED, SYNTAX_NODE.WIKILINK_MARK, SYNTAX_NODE.WIKILINK_TARGET],
  parseInline: [wikilinkParser, wikiEmbedParser],
};
