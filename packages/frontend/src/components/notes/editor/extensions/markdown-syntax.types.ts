import type { SyntaxNode } from "@lezer/common";

/** Lezer markdown syntax-node names the editor reads */
export const SYNTAX_NODE = {
  LINK: "Link",
  IMAGE: "Image",
  WIKILINK: "Wikilink",
  WIKI_EMBED: "WikiEmbed",
  WIKILINK_MARK: "WikilinkMark",
  WIKILINK_TARGET: "WikilinkTarget",
  AUTOLINK: "Autolink",
  URL: "URL",
  LINK_MARK: "LinkMark",
  HEADER_MARK: "HeaderMark",
  ESCAPE: "Escape",
  TAG_LINE: "TagLine",
  TAG: "Tag",
  HORIZONTAL_RULE: "HorizontalRule",
  FENCED_CODE: "FencedCode",
  CODE_MARK: "CodeMark",
  CODE_INFO: "CodeInfo",
  PARAGRAPH: "Paragraph",
  BLOCKQUOTE: "Blockquote",
  QUOTE_MARK: "QuoteMark",
  BULLET_LIST: "BulletList",
  ORDERED_LIST: "OrderedList",
  LIST_ITEM: "ListItem",
  LIST_MARK: "ListMark",
  TASK: "Task",
  TASK_MARKER: "TaskMarker",
  HTML_TAG: "HTMLTag",
  TABLE: "Table",
  TABLE_HEADER: "TableHeader",
  TABLE_ROW: "TableRow",
  TABLE_CELL: "TableCell",
  TABLE_DELIMITER: "TableDelimiter",
} as const;

/** Inline constructs wrapped in a matching pair of delimiter marks */
export const DELIMITED_SYNTAX_NODE = {
  EMPHASIS: "Emphasis",
  STRONG_EMPHASIS: "StrongEmphasis",
  STRIKETHROUGH: "Strikethrough",
  SUPERSCRIPT: "Superscript",
  SUBSCRIPT: "Subscript",
  INLINE_CODE: "InlineCode",
} as const;

export type DelimitedSyntaxNodeName = (typeof DELIMITED_SYNTAX_NODE)[keyof typeof DELIMITED_SYNTAX_NODE];

export interface DelimiterPair {
  open: SyntaxNode;
  close: SyntaxNode;
}

export interface FencedCodeParts {
  openMark: SyntaxNode;
  /** Absent while the block is unterminated */
  closeMark?: SyntaxNode;
}
