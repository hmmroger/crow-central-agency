import { createContext, useContext, useState, useCallback, useRef } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { AnimatePresence } from "framer-motion";
import { ModalDialogRenderer } from "../components/common/modal-dialog-renderer";
import type { ModalDialogConfig, ModalDialogContextValue, ModalDialogShowConfig } from "./modal-dialog-provider.types";

const ModalDialogContext = createContext<ModalDialogContextValue | undefined>(undefined);

/**
 * Modal dialog context provider
 *
 * Manages a stack of dialog configurations and controls renderer mount/unmount.
 * Supports modal stacking — calling showDialog while a dialog is open pushes
 * a new dialog on top. hideDialog pops the topmost dialog and restores focus
 * to the one beneath. The portal and AnimatePresence live here so renderers
 * only mount when the stack is non-empty (zero overhead otherwise).
 */
export function ModalDialogProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<ModalDialogConfig[]>([]);
  const stackRef = useRef<ModalDialogConfig[]>([]);

  const hideDialog = useCallback((id?: string) => {
    const current = stackRef.current;
    if (current.length === 0) {
      return;
    }

    const targetIndex = id !== undefined ? current.findIndex((entry) => entry.id === id) : current.length - 1;

    if (targetIndex === -1) {
      return;
    }

    const target = current[targetIndex];
    const next = current.filter((_, entryIndex) => entryIndex !== targetIndex);
    stackRef.current = next;
    setStack(next);
    target.onClose?.();
  }, []);

  const showDialog = useCallback(<P,>(newConfig: ModalDialogShowConfig<P>) => {
    const stored = newConfig as ModalDialogConfig;
    const current = stackRef.current;

    // Replace if the same ID is already in the stack, otherwise push
    const existingIndex = current.findIndex((entry) => entry.id === stored.id);
    const next =
      existingIndex !== -1
        ? current.map((entry, mapIndex) => (mapIndex === existingIndex ? stored : entry))
        : [...current, stored];

    stackRef.current = next;
    setStack(next);
  }, []);

  const isDialogOpen = useCallback((id: string) => stack.some((entry) => entry.id === id), [stack]);

  return (
    <ModalDialogContext.Provider value={{ showDialog, hideDialog, isDialogOpen }}>
      {children}
      <FloatingPortal>
        <AnimatePresence>
          {stack.map((config, index) => (
            <ModalDialogRenderer
              key={config.id}
              config={config}
              stackDepth={index}
              onClose={() => hideDialog(config.id)}
            />
          ))}
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
