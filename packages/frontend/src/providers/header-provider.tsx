import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import type { HeaderAction, HeaderContextValue, HeaderDropdownConfig } from "./header-provider.types.js";

const EMPTY_ACTIONS: HeaderAction[] = [];

export const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

/**
 * Provides header title + optional dropdown + optional actions state. Views push values via HeaderPortal.
 * Setters are stable refs that only trigger re-renders when the value actually changes.
 */
export function HeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState("");
  const [dropdown, setDropdownState] = useState<HeaderDropdownConfig | undefined>(undefined);
  const [actions, setActionsState] = useState<HeaderAction[]>(EMPTY_ACTIONS);

  const setTitle = useCallback((newTitle: string) => {
    setTitleState((prev) => (prev === newTitle ? prev : newTitle));
  }, []);

  const setDropdown = useCallback((newDropdown: HeaderDropdownConfig | undefined) => {
    setDropdownState((prev) => (prev === newDropdown ? prev : newDropdown));
  }, []);

  const setActions = useCallback((newActions: HeaderAction[]) => {
    setActionsState((prev) => (prev === newActions ? prev : newActions));
  }, []);

  const value = useMemo<HeaderContextValue>(
    () => ({ title, setTitle, dropdown, setDropdown, actions, setActions }),
    [title, setTitle, dropdown, setDropdown, actions, setActions]
  );

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}
