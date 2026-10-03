import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

const HIDDEN_SYNTAX = Decoration.replace({});

/** A plugin may not replace a line break, so a hidden range that crosses lines is left visible. */
export function hideSyntax(state: EditorState, decorations: Range<Decoration>[], from: number, to: number): void {
  if (from < to && state.doc.lineAt(from).number === state.doc.lineAt(to).number) {
    decorations.push(HIDDEN_SYNTAX.range(from, to));
  }
}

export function skipFollowingSpace(state: EditorState, position: number): number {
  return state.doc.sliceString(position, position + 1) === " " ? position + 1 : position;
}

/** True when any selection range touches `[from, to]`, which is when a construct shows its raw syntax. */
export function isSelectionTouching(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

/** The innermost syntax node named `name` around `position`, looking at the character before it. */
export function findSyntaxAncestor(state: EditorState, position: number, name: string): SyntaxNode | undefined {
  for (
    let current: SyntaxNode | null = syntaxTree(state).resolveInner(position, -1);
    current;
    current = current.parent
  ) {
    if (current.name === name) {
      return current;
    }
  }

  return undefined;
}

export function findChildren(syntaxNode: SyntaxNode, name: string): SyntaxNode[] {
  const children: SyntaxNode[] = [];

  for (let child = syntaxNode.firstChild; child; child = child.nextSibling) {
    if (child.name === name) {
      children.push(child);
    }
  }

  return children;
}
