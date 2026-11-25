import { useCallback, useEffect, useImperativeHandle, useMemo, useState, type Ref, type RefObject } from "react";
import type { LexedMarkdown } from "../../../utils/marked-config.types.js";
import { locateCurrentMatch, matchFindItems } from "./find-matcher.js";
import { buildMarkdownFindText, toTokenMarks } from "./markdown-find.js";
import type { FindMatch, FindQuery, FindResult, FindSurfaceHandle } from "./find.types.js";
import type { MarkdownFindMarks } from "./markdown-find.types.js";

interface MarkdownFindOptions {
  itemId: string;
  /** Undefined until the content is loaded */
  markdownDocument?: LexedMarkdown;
  /** The element the surface's selection and focus belong to */
  containerRef: RefObject<HTMLElement | null>;
  /** Called with undefined while the surface holds no query */
  onResult: (result?: FindResult) => void;
  ref?: Ref<FindSurfaceHandle>;
}

interface MarkdownFindState {
  query?: FindQuery;
  current?: FindMatch;
  revealKey: number;
}

/**
 * A find surface over one parsed markdown document: its find text is derived from the document's tokens,
 * matched against the query, and recounted whenever the document changes. Returns the renderer's marks.
 */
export function useMarkdownFind({
  itemId,
  markdownDocument,
  containerRef,
  onResult,
  ref,
}: MarkdownFindOptions): MarkdownFindMarks | undefined {
  const findText = useMemo(
    () => (markdownDocument ? buildMarkdownFindText(markdownDocument) : undefined),
    [markdownDocument]
  );
  const [{ query, current, revealKey }, setState] = useState<MarkdownFindState>({ revealKey: 0 });
  const items = useMemo(() => (findText ? [{ id: itemId, text: findText.text }] : []), [findText, itemId]);
  const matches = useMemo(() => (query ? matchFindItems(items, query) : []), [items, query]);
  const currentIndex = useMemo(() => locateCurrentMatch(items, matches, current), [items, matches, current]);

  useEffect(() => {
    onResult(query ? { currentIndex, total: matches.length } : undefined);
  }, [onResult, query, currentIndex, matches.length]);

  const step = useCallback(
    (offset: number) => {
      const index = currentIndex === undefined ? undefined : (currentIndex + offset + matches.length) % matches.length;
      setState((previous) => ({
        query: previous.query,
        current: index === undefined ? previous.current : matches[index],
        revealKey: previous.revealKey + 1,
      }));
    },
    [currentIndex, matches]
  );

  useImperativeHandle(
    ref,
    () => ({
      setQuery: (query) =>
        setState((previous) => ({ query, current: previous.current, revealKey: previous.revealKey + 1 })),
      next: () => step(1),
      previous: () => step(-1),
      clear: () => setState((previous) => ({ revealKey: previous.revealKey })),
      getSelectionQuery: () => {
        const selection = window.getSelection();
        const container = containerRef.current;
        if (!selection || !container || selection.isCollapsed || !container.contains(selection.anchorNode)) {
          return undefined;
        }

        const text = selection.toString();
        return text.trim() ? text : undefined;
      },
      focus: () => containerRef.current?.focus(),
    }),
    [step, containerRef]
  );

  return useMemo(
    () => (findText ? { marks: toTokenMarks(findText, matches, currentIndex), revealKey } : undefined),
    [findText, matches, currentIndex, revealKey]
  );
}
