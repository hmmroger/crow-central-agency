import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext } from "./request-context.types.js";

/** Default timezone used when client does not provide one */
export const DEFAULT_TIMEZONE = "UTC";

/** AsyncLocalStorage instance that holds the per-request context */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context from AsyncLocalStorage.
 * Must be called within a request lifecycle (after the request context hook runs).
 *
 * @returns The current request context
 * @throws Error if called outside a request context
 */
export function getRequestContext(): RequestContext {
  const store = requestContextStorage.getStore();
  if (!store) {
    throw new Error("getRequestContext() called outside of a request context");
  }

  return store;
}
