"use no memo";

import { useVirtualizer } from "@tanstack/react-virtual";

type UseVirtualizerOptions = Parameters<typeof useVirtualizer>[0];

/**
 * Thin wrapper around useVirtualizer that opts out of React Compiler memoization.
 * TanStack Virtual returns functions that the compiler cannot safely memoize,
 * so we isolate the incompatibility here.
 */
export function useVirtualList(options: UseVirtualizerOptions) {
  // eslint-disable-next-line react-hooks/incompatible-library
  return useVirtualizer(options);
}
