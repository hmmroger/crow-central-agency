import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { unescapeWikilinkTarget } from "@crow-central-agency/shared";
import { findChildren } from "./cm-extension-utils.js";
import {
  DELIMITED_SYNTAX_NODE,
  SYNTAX_NODE,
  type DelimitedSyntaxNodeName,
  type DelimiterPair,
  type FencedCodeParts,
} from "./markdown-syntax.types.js";

const ATX_HEADING_PATTERN = /^ATXHeading([1-6])$/;

const DELIMITER_MARK_NAMES: Record<DelimitedSyntaxNodeName, string> = {
  [DELIMITED_SYNTAX_NODE.EMPHASIS]: "EmphasisMark",
  [DELIMITED_SYNTAX_NODE.STRONG_EMPHASIS]: "EmphasisMark",
  [DELIMITED_SYNTAX_NODE.STRIKETHROUGH]: "StrikethroughMark",
  [DELIMITED_SYNTAX_NODE.SUPERSCRIPT]: "SuperscriptMark",
  [DELIMITED_SYNTAX_NODE.SUBSCRIPT]: "SubscriptMark",
  [DELIMITED_SYNTAX_NODE.INLINE_CODE]: "CodeMark",
};

const DELIMITED_SYNTAX_NODE_NAMES = new Set<string>(Object.values(DELIMITED_SYNTAX_NODE));
const CHECKED_TASK_MARKER_PATTERN = /^\[[xX]\]$/;

/** True for `[x]` / `[X]`, false for `[ ]`. */
export function isTaskMarkerChecked(markerText: string): boolean {
  return CHECKED_TASK_MARKER_PATTERN.test(markerText);
}

export function isDelimitedSyntaxNodeName(name: string): name is DelimitedSyntaxNodeName {
  return DELIMITED_SYNTAX_NODE_NAMES.has(name);
}

/** Heading level of an ATX heading syntax node, or `undefined` for anything else. */
export function getAtxHeadingLevel(name: string): number | undefined {
  const match = name.match(ATX_HEADING_PATTERN);

  return match ? Number(match[1]) : undefined;
}

/** The opening and closing delimiter marks, or `undefined` if the construct is unterminated. */
export function findDelimiters(syntaxNode: SyntaxNode, name: DelimitedSyntaxNodeName): DelimiterPair | undefined {
  const marks = findChildren(syntaxNode, DELIMITER_MARK_NAMES[name]);

  if (marks.length < 2) {
    return undefined;
  }

  return { open: marks[0], close: marks[marks.length - 1] };
}

export function getFencedCodeParts(fencedCode: SyntaxNode): FencedCodeParts | undefined {
  const codeMarks = findChildren(fencedCode, SYNTAX_NODE.CODE_MARK);

  if (codeMarks.length === 0) {
    return undefined;
  }

  return { openMark: codeMarks[0], closeMark: codeMarks.length > 1 ? codeMarks[codeMarks.length - 1] : undefined };
}

/** The first word of the info string, lower-cased, e.g. `ts` for ```` ```TS title ````. */
export function getFencedCodeLanguage(state: EditorState, fencedCode: SyntaxNode): string | undefined {
  const [info] = findChildren(fencedCode, SYNTAX_NODE.CODE_INFO);
  const [language] = info ? state.sliceDoc(info.from, info.to).trim().split(/\s+/) : [];

  return language ? language.toLowerCase() : undefined;
}

/** The note a wikilink or embed target names: trimmed, with its escapes removed. */
export function getWikilinkTarget(state: EditorState, targetNode: SyntaxNode): string {
  return unescapeWikilinkTarget(state.sliceDoc(targetNode.from, targetNode.to).trim());
}

/** The code between the fence lines. */
export function getFencedCodeText(state: EditorState, fencedCode: SyntaxNode): string {
  const parts = getFencedCodeParts(fencedCode);

  if (!parts) {
    return "";
  }

  const from = state.doc.lineAt(parts.openMark.from).to + 1;
  const to = parts.closeMark ? state.doc.lineAt(parts.closeMark.from).from - 1 : fencedCode.to;

  return from < to ? state.sliceDoc(from, to) : "";
}
