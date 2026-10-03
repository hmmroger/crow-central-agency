import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { hashKey, QueryObserver } from "@tanstack/react-query";
import { WIKILINK_RESOLVE_MAX_TARGETS } from "@crow-central-agency/shared";
import { wikilinkResolveQueryOptions } from "../../../../hooks/queries/use-wikilink-resolve-query.js";
import type { WikilinkResolutionMap } from "../../../../hooks/queries/use-wikilink-resolve-query.types.js";
import type { ApiError } from "../../../../services/api-client.types.js";
import { queryClient } from "../../../../services/query-client.js";
import { getWikilinkTarget } from "./markdown-syntax.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";

export const setWikilinkResolutions = StateEffect.define<WikilinkResolutionMap>();

const EMPTY_RESOLUTIONS: WikilinkResolutionMap = new Map();
const RESOLVE_DEBOUNCE_MS = 300;

/** The distinct wikilink and embed targets in the parsed document, table cells included, sorted. */
function collectWikilinkTargets(state: EditorState): string[] {
  const targets = new Set<string>();

  syntaxTree(state).iterate({
    enter: (nodeRef) => {
      if (nodeRef.name !== SYNTAX_NODE.WIKILINK && nodeRef.name !== SYNTAX_NODE.WIKI_EMBED) {
        return undefined;
      }

      const targetNode = nodeRef.node.getChild(SYNTAX_NODE.WIKILINK_TARGET);
      const target = targetNode ? getWikilinkTarget(state, targetNode) : "";

      if (target) {
        targets.add(target);
      }

      return false;
    },
  });

  return Array.from(targets).sort().slice(0, WIKILINK_RESOLVE_MAX_TARGETS);
}

function isSameResolutions(first: WikilinkResolutionMap, second: WikilinkResolutionMap): boolean {
  if (first.size !== second.size) {
    return false;
  }

  for (const [target, note] of first) {
    const other = second.get(target);

    if (
      !second.has(target) ||
      note?.id !== other?.id ||
      note?.path !== other?.path ||
      note?.updatedTimestamp !== other?.updatedTimestamp
    ) {
      return false;
    }
  }

  return true;
}

export const wikilinkResolutionField = StateField.define<WikilinkResolutionMap>({
  create: (state) =>
    queryClient.getQueryData(wikilinkResolveQueryOptions(collectWikilinkTargets(state)).queryKey) ?? EMPTY_RESOLUTIONS,
  update: (resolutions, transaction) =>
    transaction.effects.reduce(
      (current, effect) => (effect.is(setWikilinkResolutions) ? effect.value : current),
      resolutions
    ),
});

/**
 * Keeps one batched resolve query on the document's wikilink targets, following edits after a pause, and
 * copies each answer into state. The query is active, so a note change that invalidates it refetches it.
 */
class WikilinkResolutionSync {
  private readonly observer: QueryObserver<WikilinkResolutionMap, ApiError>;
  private readonly unsubscribe: () => void;
  private queryHash: string;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly view: EditorView) {
    const options = wikilinkResolveQueryOptions(collectWikilinkTargets(view.state));

    this.queryHash = hashKey(options.queryKey);
    this.observer = new QueryObserver(queryClient, options);
    // Observer notifications are batched onto a later task, so this never dispatches inside an update.
    this.unsubscribe = this.observer.subscribe((result) => this.applyResolutions(result.data));
  }

  public update(update: ViewUpdate): void {
    if (update.docChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.refreshTargets(), RESOLVE_DEBOUNCE_MS);
    }
  }

  public destroy(): void {
    clearTimeout(this.refreshTimer);
    this.unsubscribe();
  }

  private refreshTargets(): void {
    const options = wikilinkResolveQueryOptions(collectWikilinkTargets(this.view.state));
    const queryHash = hashKey(options.queryKey);

    if (queryHash !== this.queryHash) {
      this.queryHash = queryHash;
      this.observer.setOptions(options);
    }
  }

  private applyResolutions(resolutions: WikilinkResolutionMap | undefined): void {
    if (resolutions && !isSameResolutions(resolutions, getWikilinkResolutions(this.view.state))) {
      this.view.dispatch({ effects: setWikilinkResolutions.of(resolutions) });
    }
  }
}

/** What each answered wikilink target names; empty when the extension is not installed. */
export function getWikilinkResolutions(state: EditorState): WikilinkResolutionMap {
  return state.field(wikilinkResolutionField, false) ?? EMPTY_RESOLUTIONS;
}

export function wikilinkResolutions(): Extension {
  return [wikilinkResolutionField, ViewPlugin.fromClass(WikilinkResolutionSync)];
}
