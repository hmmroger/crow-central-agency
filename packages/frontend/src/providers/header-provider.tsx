import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Navigation data for the header — title only, back is framework-managed */
export interface HeaderNav {
  /** Page/view title displayed in the header */
  title: string;
}

/** A single action button descriptor */
export interface HeaderAction {
  /** Unique key for React list rendering */
  key: string;
  /** Button label text */
  label: string;
  /** Optional icon rendered before the label */
  icon?: LucideIcon;
  /** Click handler */
  onClick: () => void;
  /** Disable the button */
  disabled?: boolean;
  /** Emphasized/primary treatment */
  isPrimary?: boolean;
  /** Danger/destructive treatment */
  isDestructive?: boolean;
}

/** Structured header content that views register */
export interface HeaderSlots {
  nav?: HeaderNav;
  actions?: HeaderAction[];
}

export interface HeaderContextValue {
  slots: HeaderSlots;
  setSlots: (slots: HeaderSlots) => void;
  clearSlots: () => void;
}

export const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

/**
 * Provides a shared header slot context.
 * Views register structured data (nav + actions), and AppHeader renders them consistently.
 */
export function HeaderProvider({ children }: { children: ReactNode }) {
  const [slots, setSlotsState] = useState<HeaderSlots>({});

  const setSlots = useCallback((newSlots: HeaderSlots) => {
    setSlotsState(newSlots);
  }, []);

  const clearSlots = useCallback(() => {
    setSlotsState({});
  }, []);

  const value = useMemo(() => ({ slots, setSlots, clearSlots }), [slots, setSlots, clearSlots]);

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}
