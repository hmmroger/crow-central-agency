import { useContext } from "react";
import { HeaderContext, type HeaderContextValue } from "../providers/header-provider.js";

/**
 * Single hook for header state — used by both views (to set) and AppHeader (to read).
 * Setters are stable refs with internal change detection — safe to call every render.
 */
export function useHeader(): HeaderContextValue {
  const context = useContext(HeaderContext);

  if (!context) {
    throw new Error("useHeader must be used within HeaderProvider");
  }

  return context;
}
