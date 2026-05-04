import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { AnimatePresence } from "framer-motion";
import { FullPanelRenderer } from "../components/common/full-panel-renderer.js";
import type { FullPanelConfig, FullPanelContextValue } from "./full-panel-provider.types.js";

export const FullPanelContext = createContext<FullPanelContextValue | undefined>(undefined);

/**
 * Provides a single full-region content takeover surface (no backdrop, not modal).
 * Used to surface side-panel tab content on screens narrower than the side panel
 * breakpoint. Only one panel is tracked at a time — calling `show` while a panel
 * is open replaces it. The portal/AnimatePresence live here so the renderer only
 * mounts when a panel is open.
 */
export function FullPanelProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<FullPanelConfig | undefined>(undefined);
  const currentRef = useRef<FullPanelConfig | undefined>(undefined);

  const hide = useCallback(() => {
    const previous = currentRef.current;
    if (!previous) {
      return;
    }

    currentRef.current = undefined;
    setCurrent(undefined);
    previous.onClose?.();
  }, []);

  const show = useCallback((config: FullPanelConfig) => {
    currentRef.current = config;
    setCurrent(config);
  }, []);

  const isOpen = useCallback((id: string) => current?.id === id, [current]);

  const value = useMemo<FullPanelContextValue>(() => ({ show, hide, isOpen, current }), [show, hide, isOpen, current]);

  return (
    <FullPanelContext.Provider value={value}>
      {children}
      <FloatingPortal>
        <AnimatePresence>
          {current && <FullPanelRenderer key={current.id} config={current} onClose={hide} />}
        </AnimatePresence>
      </FloatingPortal>
    </FullPanelContext.Provider>
  );
}
