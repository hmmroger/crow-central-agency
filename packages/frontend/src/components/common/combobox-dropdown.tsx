import type { ReactNode } from "react";
import { FloatingPortal } from "@floating-ui/react";
import type { ComboboxFloatingBindings } from "./use-combobox-dropdown.js";

interface ComboboxDropdownProps {
  floatingRef: ComboboxFloatingBindings["floatingRef"];
  floatingStyles: ComboboxFloatingBindings["floatingStyles"];
  floatingProps: ComboboxFloatingBindings["floatingProps"];
  isEmpty: boolean;
  emptyMessage: string;
  children: ReactNode;
}

/**
 * Portaled, positioned shell for a combobox option list. Keep `children` non-focusable — the open
 * state is driven by focus containment on the reference container.
 */
export function ComboboxDropdown({
  floatingRef,
  floatingStyles,
  floatingProps,
  isEmpty,
  emptyMessage,
  children,
}: ComboboxDropdownProps) {
  return (
    <FloatingPortal>
      <div
        ref={floatingRef}
        style={floatingStyles}
        {...floatingProps}
        className="z-50 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-elevated"
      >
        {isEmpty ? <div className="px-2 py-1.5 text-2xs text-text-muted">{emptyMessage}</div> : children}
      </div>
    </FloatingPortal>
  );
}
