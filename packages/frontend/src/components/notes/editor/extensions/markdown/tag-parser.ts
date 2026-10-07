import type { Input } from "@lezer/common";
import type {
  BlockContext,
  BlockParser,
  Element,
  LeafBlock,
  LeafBlockParser,
  Line,
  MarkdownConfig,
} from "@lezer/markdown";
import { TAG_LINE_SOURCE, TAG_SOURCE } from "@crow-central-agency/shared";
import type { TagPosition } from "./tag-parser.types.js";

const TAG_LINE_PATTERN = new RegExp(`^${TAG_LINE_SOURCE}$`, "u");
const TAG_PATTERN = new RegExp(TAG_SOURCE, "gu");
const DOCUMENT_DEPTH = 1;

function isOnlyTagsAndWhitespace(text: string): boolean {
  return text.split("\n").every((line) => {
    const trimmed = line.trim();

    return trimmed === "" || TAG_LINE_PATTERN.test(trimmed);
  });
}

function isParserInput(value: unknown): value is Input {
  return typeof value === "object" && value !== null && "read" in value && typeof value.read === "function";
}

/**
 * Tags only count at the end of a note, but a leaf parser only sees its own
 * block. `BlockContext` keeps the parse input and end undeclared, so they are
 * read reflectively and the tag line is dropped if either is missing.
 */
function readRemainingInput(cx: BlockContext): string | undefined {
  const input: unknown = Reflect.get(cx, "input");
  const documentEnd: unknown = Reflect.get(cx, "to");

  if (!isParserInput(input) || typeof documentEnd !== "number") {
    return undefined;
  }

  return input.read(cx.parsedPos, documentEnd);
}

function findTags(text: string, basePosition: number): TagPosition[] {
  return Array.from(text.matchAll(TAG_PATTERN), (match) => ({
    from: basePosition + match.index,
    to: basePosition + match.index + match[0].length,
  }));
}

/** Accepts a block only if every line is tags and nothing but tags follows it. */
class TagLineLeafParser implements LeafBlockParser {
  private tags: TagPosition[];
  private isInvalid = false;

  constructor(content: string, basePosition: number) {
    this.tags = findTags(content, basePosition);
  }

  public nextLine(cx: BlockContext, line: Line): boolean {
    const content = line.text.slice(line.pos);

    if (TAG_LINE_PATTERN.test(content)) {
      this.tags = this.tags.concat(findTags(content, cx.lineStart + line.pos));
    } else {
      this.isInvalid = true;
    }

    return false;
  }

  public finish(cx: BlockContext, leaf: LeafBlock): boolean {
    if (this.isInvalid) {
      return false;
    }

    const remaining = readRemainingInput(cx);

    if (remaining === undefined || !isOnlyTagsAndWhitespace(remaining)) {
      return false;
    }

    const children: Element[] = this.tags.map(({ from, to }) =>
      cx.elt("Tag", from, to, [cx.elt("TagMark", from, from + 1)])
    );

    cx.addLeafElement(leaf, cx.elt("TagLine", leaf.start, leaf.start + leaf.content.length, children));

    return true;
  }
}

const tagBlockParser: BlockParser = {
  name: "TagLine",
  leaf(cx, leaf) {
    if (cx.depth > DOCUMENT_DEPTH || !TAG_LINE_PATTERN.test(leaf.content)) {
      return null;
    }

    return new TagLineLeafParser(leaf.content, leaf.start);
  },
};

/** Parses trailing `#tag` lines into `TagLine > Tag > TagMark` nodes. */
export const TagParser: MarkdownConfig = {
  defineNodes: [{ name: "TagLine", block: true }, "Tag", "TagMark"],
  parseBlock: [tagBlockParser],
};
