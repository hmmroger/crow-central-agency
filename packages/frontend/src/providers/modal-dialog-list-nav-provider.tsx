/**
 * Context for modal dialog list navigation.
 *
 * Provides activeIndex and getItemProps to content components that opt in
 * to arrow-key list navigation via useModalDialogListNav() + useListItem().
 */

import { createContext, useContext } from "react";
import type { useInteractions } from "@floating-ui/react";

export interface ModalDialogListNavContextValue {
  activeIndex: number | null;
  getItemProps: ReturnType<typeof useInteractions>["getItemProps"];
}

export const ModalDialogListNavContext = createContext<ModalDialogListNavContextValue | undefined>(undefined);

/**
 * Consumer hook for list navigation inside a floating dialog.
 * Must be called within a ModalDialogRenderer that has listNavigation enabled.
 */
export function useModalDialogListNav(): ModalDialogListNavContextValue {
  const ctx = useContext(ModalDialogListNavContext);
  if (!ctx) {
    throw new Error("useModalDialogListNav must be used inside a ModalDialog with listNavigation enabled");
  }

  return ctx;
}
