import { createContext, useContext, useState, useCallback, useRef } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { AnimatePresence } from "framer-motion";
import { ContextMenuRenderer } from "../components/common/context-menu-renderer";
import type { ContextMenuConfig, ContextMenuContextValue } from "./context-menu-provider.types";

const ContextMenuContext = createContext<ContextMenuContextValue | undefined>(undefined);

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ContextMenuConfig | undefined>(undefined);
  const configRef = useRef<ContextMenuConfig | undefined>(undefined);

  const hideMenu = useCallback(() => {
    const prev = configRef.current;
    configRef.current = undefined;
    setConfig(undefined);
    prev?.onClose?.();
  }, []);

  const showMenu = useCallback((newConfig: ContextMenuConfig) => {
    // If replacing an already-open menu, call previous onClose
    const prev = configRef.current;
    if (prev) {
      prev.onClose?.();
    }

    configRef.current = newConfig;
    setConfig(newConfig);
  }, []);

  const toggleMenu = useCallback(
    (newConfig: ContextMenuConfig & { id: string }) => {
      if (configRef.current?.id === newConfig.id) {
        hideMenu();
      } else {
        showMenu(newConfig);
      }
    },
    [hideMenu, showMenu]
  );

  const isMenuOpen = useCallback((id: string) => config?.id === id, [config?.id]);

  return (
    <ContextMenuContext.Provider value={{ showMenu, toggleMenu, hideMenu, isMenuOpen }}>
      {children}
      <FloatingPortal>
        <AnimatePresence>
          {config && <ContextMenuRenderer key="context-menu" config={config} onClose={hideMenu} />}
        </AnimatePresence>
      </FloatingPortal>
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu(): ContextMenuContextValue {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error("useContextMenu must be used within a ContextMenuProvider");
  }

  return ctx;
}
