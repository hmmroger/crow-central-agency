import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { findWikilinkEscapeOffsets, unescapeWikilinkTarget, type NoteMetadata } from "@crow-central-agency/shared";
import { resolveWikilinkTarget } from "../../../../utils/wikilink-resolver.js";
import { findChildren } from "./cm-extension-utils.js";
import { LINK_OPEN_HINT } from "./inline-decorators.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import type { WikilinkMarkSpec, WikilinkSyntax } from "./wikilink-syntax.types.js";

export const WIKILINK_CLASS = "cm-md-wikilink";
export const WIKILINK_TARGET_ATTRIBUTE = "data-wikilink-target";

const UNRESOLVED_WIKILINK_CLASS = "cm-md-wikilink-unresolved";
const WIKILINK_CREATE_HINT = "Ctrl/Cmd + click to create";

export function readWikilink(syntaxNode: SyntaxNode, state: EditorState): WikilinkSyntax | undefined {
  const marks = findChildren(syntaxNode, SYNTAX_NODE.WIKILINK_MARK);
  const targetNode = syntaxNode.getChild(SYNTAX_NODE.WIKILINK_TARGET);

  if (marks.length < 2 || !targetNode) {
    return undefined;
  }

  const rawTarget = state.sliceDoc(targetNode.from, targetNode.to);

  return {
    from: syntaxNode.from,
    to: syntaxNode.to,
    openMark: { from: marks[0].from, to: marks[0].to },
    closeMark: { from: marks[1].from, to: marks[1].to },
    targetRange: { from: targetNode.from, to: targetNode.to },
    escapePositions: findWikilinkEscapeOffsets(rawTarget).map((offset) => targetNode.from + offset),
    target: unescapeWikilinkTarget(rawTarget.trim()),
  };
}

/** A target that names nothing is styled as unresolved, and a Ctrl/Cmd + click creates it. */
export function getWikilinkMarkSpec(target: string, notes: NoteMetadata[]): WikilinkMarkSpec {
  const isResolved = resolveWikilinkTarget(notes, target) !== undefined;

  return {
    className: isResolved ? WIKILINK_CLASS : `${WIKILINK_CLASS} ${UNRESOLVED_WIKILINK_CLASS}`,
    attributes: { [WIKILINK_TARGET_ATTRIBUTE]: target, title: isResolved ? LINK_OPEN_HINT : WIKILINK_CREATE_HINT },
  };
}
