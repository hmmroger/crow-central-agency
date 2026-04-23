import { useState, useEffect, useCallback, type RefObject } from "react";

interface Breakpoint {
  /** Minimum container width in pixels for this column count */
  minWidth: number;
  /** Number of columns at this breakpoint */
  columns: number;
}

interface UseContainerColumnsOptions {
  /** Ref to the container element whose width determines column count */
  containerRef: RefObject<HTMLElement | null>;
  /** Breakpoints sorted ascending by minWidth. Defaults to Tailwind md/xl grid breakpoints. */
  breakpoints?: Breakpoint[];
}

/** Default breakpoints matching Tailwind's md/lg/xl grid breakpoints */
const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { minWidth: 0, columns: 1 },
  { minWidth: 768, columns: 2 },
  { minWidth: 1024, columns: 3 },
  { minWidth: 1280, columns: 4 },
];

/**
 * Observes a container's width and returns the column count
 * based on the matching breakpoint. Only recalculates when
 * the column count actually changes.
 */
export function useContainerColumns({
  containerRef,
  breakpoints = DEFAULT_BREAKPOINTS,
}: UseContainerColumnsOptions): number {
  const resolveColumns = useCallback(
    (width: number): number => {
      let result = breakpoints[0].columns;
      for (const breakpoint of breakpoints) {
        if (width >= breakpoint.minWidth) {
          result = breakpoint.columns;
        }
      }

      return result;
    },
    [breakpoints]
  );

  const [columns, setColumns] = useState(() => {
    const element = containerRef.current;
    if (!element) {
      return breakpoints[0].columns;
    }

    return resolveColumns(element.clientWidth);
  });

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      const width = entry.contentRect.width;
      const next = resolveColumns(width);

      setColumns((previous) => (previous === next ? previous : next));
    });

    observer.observe(element);

    // Sync initial value in case the ref was not available during state init
    setColumns(resolveColumns(element.clientWidth));

    return () => observer.disconnect();
  }, [containerRef, resolveColumns]);

  return columns;
}
