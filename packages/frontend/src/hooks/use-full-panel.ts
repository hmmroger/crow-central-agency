import { useContext } from "react";
import { FullPanelContext } from "../providers/full-panel-provider.js";
import type { FullPanelContextValue } from "../providers/full-panel-provider.types.js";

/**
 * Hook for opening, closing, and inspecting the full-panel surface.
 * Must be called within a FullPanelProvider.
 */
export function useFullPanel(): FullPanelContextValue {
  const context = useContext(FullPanelContext);
  if (!context) {
    throw new Error("useFullPanel must be used within FullPanelProvider");
  }

  return context;
}
