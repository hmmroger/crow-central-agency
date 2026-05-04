import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import type { HeaderContextValue, HeaderDropdownConfig } from "./header-provider.types.js";

export const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

/**
 * Provides header title + optional dropdown state. Views push values via HeaderPortal.
 * Setters are stable refs that only trigger re-renders when the value actually changes.
 */
export function HeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState("");
  const [dropdown, setDropdownState] = useState<HeaderDropdownConfig | undefined>(undefined);

  const setTitle = useCallback((newTitle: string) => {
    setTitleState((prev) => (prev === newTitle ? prev : newTitle));
  }, []);

  const setDropdown = useCallback((newDropdown: HeaderDropdownConfig | undefined) => {
    setDropdownState((prev) => (prev === newDropdown ? prev : newDropdown));
  }, []);

  const value = useMemo<HeaderContextValue>(
    () => ({ title, setTitle, dropdown, setDropdown }),
    [title, setTitle, dropdown, setDropdown]
  );

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}
