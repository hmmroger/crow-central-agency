import type { StateCommand } from "@codemirror/state";
import type { DelimitedSyntaxNodeName } from "./extensions/markdown-syntax.types.js";

export const INLINE_FORMAT = {
  BOLD: "bold",
  ITALIC: "italic",
  STRIKETHROUGH: "strikethrough",
  INLINE_CODE: "inlineCode",
} as const;

export type InlineFormat = (typeof INLINE_FORMAT)[keyof typeof INLINE_FORMAT];

export const LIST_KIND = {
  BULLET: "bullet",
  ORDERED: "ordered",
  TASK: "task",
} as const;

export type ListKind = (typeof LIST_KIND)[keyof typeof LIST_KIND];

/** How a line-prefix command rewrites each line the selection touches */
export interface LinePrefixRule {
  /** Group 1 is indentation that is kept; group 2 is the existing prefix that is replaced */
  pattern: RegExp;
  /** The new prefix for the n-th rewritten line */
  getPrefix: (lineIndex: number) => string;
  /** Blank lines are skipped in a multi-line selection unless this is set */
  includesBlankLines?: boolean;
}

/** What a command reads and dispatches to; an `EditorView` satisfies it */
export type CommandTarget = Parameters<StateCommand>[0];

export interface InlineFormatSyntax {
  syntaxNodeName: DelimitedSyntaxNodeName;
  marker: string;
}
