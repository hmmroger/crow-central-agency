import { useContext, useEffect } from "react";
import { HeaderContext, type HeaderSlots } from "../providers/header-provider.js";

/**
 * Hook for views to register header nav and actions content.
 * Views pass structured data — the header component owns all rendering decisions.
 * Clears slots on unmount so stale content doesn't persist across view switches.
 */
export function useHeader(slots: HeaderSlots): void {
  const context = useContext(HeaderContext);

  if (!context) {
    throw new Error("useHeader must be used within HeaderProvider");
  }

  const { setSlots, clearSlots } = context;

  useEffect(() => {
    setSlots(slots);

    return () => {
      clearSlots();
    };
  });
}

/**
 * Hook to read current header slots — used by AppHeader to render view-specific content.
 */
export function useHeaderSlots(): HeaderSlots {
  const context = useContext(HeaderContext);

  if (!context) {
    throw new Error("useHeaderSlots must be used within HeaderProvider");
  }

  return context.slots;
}
