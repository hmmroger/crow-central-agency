import { createContext, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** A single action button descriptor */
export interface HeaderAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  isPrimary?: boolean;
  isDestructive?: boolean;
}

export interface HeaderContextValue {
  title: string;
  actions: HeaderAction[];
  setTitle: (title: string) => void;
  setActions: (actions: HeaderAction[]) => void;
}

export const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

/** Shallow compare two HeaderAction arrays by comparing serializable fields */
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
      prevAction.icon !== nextAction.icon
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Provides header state (title + actions) with granular updates.
 * Setters are stable refs that only trigger re-renders when values actually change.
 */
export function HeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState("");
  const [actions, setActionsState] = useState<HeaderAction[]>([]);

  const actionsRef = useRef<HeaderAction[]>(actions);

  const setTitleRef = useRef((newTitle: string) => {
    setTitleState((prev) => (prev === newTitle ? prev : newTitle));
  });

  const setActionsRef = useRef((newActions: HeaderAction[]) => {
    if (actionsEqual(actionsRef.current, newActions)) {
      return;
    }

    actionsRef.current = newActions;
    setActionsState(newActions);
  });

  const contextValue = useRef<HeaderContextValue>({
    title,
    actions,
    setTitle: setTitleRef.current,
    setActions: setActionsRef.current,
  });

  contextValue.current.title = title;
  contextValue.current.actions = actions;

  return <HeaderContext.Provider value={contextValue.current}>{children}</HeaderContext.Provider>;
}
