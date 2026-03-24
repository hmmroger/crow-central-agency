import { createContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

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

export interface HeaderContextValue {
  title: string;
  actions: HeaderAction[];
  setTitle: (title: string) => void;
  setActions: (actions: HeaderAction[]) => void;
}

export const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

/**
 * Shallow compare two HeaderAction arrays — includes onClick reference comparison
 * to ensure stale closures are always replaced.
 */
function actionsEqual(prev: HeaderAction[], next: HeaderAction[]): boolean {
  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index++) {
    const prevAction = prev[index];
    const nextAction = next[index];

    if (
      prevAction.key !== nextAction.key ||
      prevAction.label !== nextAction.label ||
      prevAction.disabled !== nextAction.disabled ||
      prevAction.isPrimary !== nextAction.isPrimary ||
      prevAction.isDestructive !== nextAction.isDestructive ||
      prevAction.icon !== nextAction.icon ||
      prevAction.onClick !== nextAction.onClick
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Provides header state (title + actions) with granular updates.
 * Setters are stable refs that only trigger re-renders when values actually change.
 * Context value is a new reference (via useMemo) when title or actions change,
 * ensuring consumers re-render correctly.
 */
export function HeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState("");
  const [actions, setActionsState] = useState<HeaderAction[]>([]);

  const setTitleRef = useRef((newTitle: string) => {
    setTitleState((prev) => (prev === newTitle ? prev : newTitle));
  });

  const setActionsRef = useRef((newActions: HeaderAction[]) => {
    setActionsState((prev) => (actionsEqual(prev, newActions) ? prev : newActions));
  });

  const value = useMemo<HeaderContextValue>(
    () => ({
      title,
      actions,
      setTitle: setTitleRef.current,
      setActions: setActionsRef.current,
    }),
    [title, actions]
  );

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}
