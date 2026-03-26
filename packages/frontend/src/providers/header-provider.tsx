import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";

export interface HeaderContextValue {
  title: string;
  setTitle: (title: string) => void;
}

export const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

/**
 * Provides header title state. Views set the title via HeaderPortal.
 * Setter is a stable ref that only triggers re-renders when the value actually changes.
 */
export function HeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState("");

  const setTitle = useCallback((newTitle: string) => {
    setTitleState((prev) => (prev === newTitle ? prev : newTitle));
  }, []);

  const value = useMemo<HeaderContextValue>(() => ({ title, setTitle }), [title, setTitle]);

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}
