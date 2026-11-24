import { useCallback, useEffect, useImperativeHandle, useMemo, useState, type Ref, type RefObject } from "react";
import { locateCurrentMatch, matchFindItems } from "./find-matcher.js";
import { createMarkdownDocument } from "./markdown-find.js";
import type { FindMatch, FindQuery, FindResult, FindSurfaceHandle } from "./find.types.js";
import type { MarkdownFindInput } from "./markdown-find.types.js";

interface MarkdownFindOptions {
  itemId: string;
  /** Undefined until the content is loaded */
  content?: string;
  /** The element the surface's selection and focus belong to */
  containerRef: RefObject<HTMLElement | null>;
  onResult: (result: FindResult) => void;
  ref?: Ref<FindSurfaceHandle>;
}

interface MarkdownFindState {
  query?: FindQuery;
  current?: FindMatch;
  revealStep: number;
}

const LINE_BREAK = "\n";

/**
 * A find surface over one markdown item: its document is lexed once, matched against the query, and
 * recounted whenever the content changes. Returns the renderer's find input.
 */
export function useMarkdownFind({
  itemId,
  content,
  containerRef,
  onResult,
  ref,
}: MarkdownFindOptions): MarkdownFindInput | undefined {
  const document = useMemo(() => (content === undefined ? undefined : createMarkdownDocument(content)), [content]);
  const [{ query, current, revealStep }, setState] = useState<MarkdownFindState>({ revealStep: 0 });
  const items = useMemo(() => (document ? [{ id: itemId, text: document.findText.text }] : []), [document, itemId]);
  const matches = useMemo(() => (query ? matchFindItems(items, query) : []), [items, query]);
  const currentIndex = useMemo(() => locateCurrentMatch(items, matches, current), [items, matches, current]);

  useEffect(() => {
    onResult({ currentIndex, total: matches.length });
  }, [onResult, currentIndex, matches.length]);

  const step = useCallback(
    (offset: number) => {
      const index = currentIndex === undefined ? undefined : (currentIndex + offset + matches.length) % matches.length;
      setState((previous) => ({
        query: previous.query,
        current: index === undefined ? previous.current : matches[index],
        revealStep: previous.revealStep + 1,
      }));
    },
    [currentIndex, matches]
  );

  useImperativeHandle(
    ref,
    () => ({
      setQuery: (query) =>
        setState((previous) => ({ query, current: previous.current, revealStep: previous.revealStep + 1 })),
      next: () => step(1),
      previous: () => step(-1),
      clear: () => setState((previous) => ({ revealStep: previous.revealStep })),
      getSelectionQuery: () => {
        const selection = window.getSelection();
        const container = containerRef.current;
        if (!selection || !container || selection.isCollapsed || !container.contains(selection.anchorNode)) {
          return undefined;
        }

        const text = selection.toString();
        return text.trim() && !text.includes(LINE_BREAK) ? text : undefined;
      },
      focus: () => containerRef.current?.focus(),
    }),
    [step, containerRef]
  );

  return useMemo(
    () => (document ? { document, matches, currentIndex, revealStep } : undefined),
    [document, matches, currentIndex, revealStep]
  );
}
