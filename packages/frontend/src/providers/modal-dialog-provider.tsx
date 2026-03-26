/**
 * Modal dialog context provider
 *
 * Manages dialog configuration state and controls renderer mount/unmount.
 * The portal and AnimatePresence live here so the renderer only mounts
 * when a dialog is active (zero overhead otherwise).
 */

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { AnimatePresence } from "framer-motion";
import { ModalDialogRenderer } from "../components/common/modal-dialog-renderer";
import type { ModalDialogConfig, ModalDialogContextValue, ModalDialogShowConfig } from "./modal-dialog-provider.types";

const ModalDialogContext = createContext<ModalDialogContextValue | undefined>(undefined);

export function ModalDialogProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ModalDialogConfig | undefined>(undefined);
  const configRef = useRef<ModalDialogConfig | undefined>(undefined);

  const hideDialog = useCallback(() => {
    const prev = configRef.current;
    configRef.current = undefined;
    setConfig(undefined);
    prev?.onClose?.();
  }, []);

  const showDialog = useCallback(<P,>(newConfig: ModalDialogShowConfig<P>) => {
    const prev = configRef.current;
    if (prev) {
      prev.onClose?.();
    }

    const stored = newConfig as ModalDialogConfig;
    configRef.current = stored;
    setConfig(stored);
  }, []);

  const isDialogOpen = useCallback((id: string) => config?.id !== undefined && config.id === id, [config]);

  return (
    <ModalDialogContext.Provider value={{ showDialog, hideDialog, isDialogOpen }}>
      {children}
      <FloatingPortal>
        <AnimatePresence>
          {config && <ModalDialogRenderer key="modal-dialog" config={config} onClose={hideDialog} />}
        </AnimatePresence>
      </FloatingPortal>
    </ModalDialogContext.Provider>
  );
}

export function useModalDialog(): ModalDialogContextValue {
  const ctx = useContext(ModalDialogContext);
  if (!ctx) {
    throw new Error("useModalDialog must be used within a ModalDialogProvider");
  }

  return ctx;
}
