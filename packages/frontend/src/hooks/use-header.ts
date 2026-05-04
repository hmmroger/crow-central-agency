import { useContext } from "react";
import { HeaderContext } from "../providers/header-provider.js";
import type { HeaderContextValue } from "../providers/header-provider.types.js";

/**
 * Hook for header title + dropdown state - used by views (to set via HeaderPortal) and AppHeader (to read).
 * Setters are stable refs with internal change detection - safe to call every render.
 */
export function useHeader(): HeaderContextValue {
  const context = useContext(HeaderContext);

  if (!context) {
    throw new Error("useHeader must be used within HeaderProvider");
  }

  return context;
}
