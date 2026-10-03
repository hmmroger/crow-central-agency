import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  escapeWikilinkTarget,
  unescapeWikilinkTarget,
  WIKILINK_TARGET_CHAR_SOURCE,
  type WikilinkSuggestion,
} from "@crow-central-agency/shared";
import { wikilinkSuggestQueryOptions } from "../../../../hooks/queries/use-wikilink-suggest-query.js";
import { queryClient } from "../../../../services/query-client.js";
import { getCurrentNoteId } from "./current-note-state.js";

/** `[[` or `![[` and the target typed so far, up to the cursor. */
const OPEN_WIKILINK_PATTERN = new RegExp(String.raw`!?\[\[${WIKILINK_TARGET_CHAR_SOURCE}*$`);
const EMBED_PREFIX = "!";
const OPEN_MARK = "[[";
const CLOSE_MARK = "]]";
const CODE_SYNTAX_NODES = new Set([
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "CodeText",
  "HTMLBlock",
  "CommentBlock",
  "ProcessingInstructionBlock",
]);

/** Shows the note's name and folder; applying it writes the suggested target, escaped. */
export function toWikilinkCompletion(suggestion: WikilinkSuggestion): Completion {
  return {
    label: suggestion.note.name,
    detail: suggestion.folderPath,
    apply: `${OPEN_MARK}${escapeWikilinkTarget(suggestion.target)}${CLOSE_MARK}`,
  };
}

function isInCode(state: EditorState, position: number): boolean {
  for (
    let current: SyntaxNode | null = syntaxTree(state).resolveInner(position, -1);
    current;
    current = current.parent
  ) {
    if (CODE_SYNTAX_NODES.has(current.name)) {
      return true;
    }
  }

  return false;
}

/** Replaces from `[[` (keeping an embed's `!`) through the cursor, and a `]]` right after it. */
export async function completeWikilink(context: CompletionContext): Promise<CompletionResult | null> {
  const match = context.matchBefore(OPEN_WIKILINK_PATTERN);

  if (!match || isInCode(context.state, context.pos)) {
    return null;
  }

  const isEmbed = match.text.startsWith(EMBED_PREFIX);
  const from = isEmbed ? match.from + EMBED_PREFIX.length : match.from;
  const { state, pos } = context;
  const suggestions = await queryClient
    .fetchQuery(
      wikilinkSuggestQueryOptions({
        query: unescapeWikilinkTarget(state.sliceDoc(from + OPEN_MARK.length, pos)),
        isEmbed,
        excludeId: getCurrentNoteId(state),
      })
    )
    .catch(() => undefined);

  if (!suggestions || context.aborted) {
    return null;
  }

  return {
    from,
    to: state.sliceDoc(pos, pos + CLOSE_MARK.length) === CLOSE_MARK ? pos + CLOSE_MARK.length : pos,
    options: suggestions.map(toWikilinkCompletion),
    filter: false,
  };
}

/** Suggests notes after `[[` and image notes after `![[`, never inside code. */
export function wikilinkAutocomplete(): Extension {
  return autocompletion({ override: [completeWikilink], icons: false });
}
