import { QueryClient } from "@tanstack/react-query";

/** Default stale time for queries (30 seconds) */
const DEFAULT_STALE_TIME_MS = 30_000;

/** Default retry count for failed queries */
const DEFAULT_RETRY_COUNT = 2;

/** Garbage collection time for unused cache entries (5 minutes) */
const GC_TIME_MS = 5 * 60 * 1000;

/**
 * Singleton QueryClient with app-wide defaults.
 * - 30s stale time (WS-backed queries override with Infinity)
 * - 2 retries on failure
 * - refetchOnWindowFocus disabled (WS keeps data fresh)
 * - 5 minutes GC for unused cache entries
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME_MS,
      gcTime: GC_TIME_MS,
      retry: DEFAULT_RETRY_COUNT,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
