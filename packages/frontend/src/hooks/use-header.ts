import { useContext } from "react";
import { HeaderContext, type HeaderContextValue } from "../providers/header-provider.js";

/**
 * Hook for header title state - used by views (to set via HeaderPortal) and AppHeader (to read).
 * Setter is a stable ref with internal change detection - safe to call every render.
 */
export function useHeader(): HeaderContextValue {
  const context = useContext(HeaderContext);

  if (!context) {
    throw new Error("useHeader must be used within HeaderProvider");
  }

  return context;
}
