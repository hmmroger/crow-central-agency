/**
 * Base modal dialog renderer
 * For use by modal dialog provider, do not use directly.
 */

import { useRef, useState } from "react";
import {
  useFloating,
  useInteractions,
  useDismiss,
  useRole,
  useListNavigation,
  FloatingOverlay,
  FloatingFocusManager,
  FloatingList,
} from "@floating-ui/react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";
import type { ModalDialogConfig } from "../../providers/modal-dialog-provider.types";
import { ModalDialogListNavContext } from "../../providers/modal-dialog-list-nav-provider";

interface ModalDialogRendererProps {
  config: ModalDialogConfig;
  onClose: () => void;
}

export function ModalDialogRenderer({ config, onClose }: ModalDialogRendererProps) {
  const { refs, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) {
        onClose();
      }
    },
  });

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const elementsRef = useRef<(HTMLElement | null)[]>([]);
  const labelsRef = useRef<(string | null)[]>([]);

  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const role = useRole(context, { role: config.role ?? "dialog" });
  const listNav = useListNavigation(context, {
    listRef: elementsRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
    enabled: config.listNavigation === true,
  });

  const { getFloatingProps, getItemProps } = useInteractions([dismiss, role, listNav]);

  const ContentComponent = config.component;

  return (
    <FloatingOverlay lockScroll className="z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm">
      <FloatingFocusManager context={context} modal>
        <motion.div
          ref={refs.setFloating}
          className={cn("rounded-lg bg-surface shadow-xl focus: outline-none", config.className)}
          {...getFloatingProps()}
          aria-labelledby={config.title ? "modal-dialog-title" : config.ariaLabelledBy}
          aria-describedby={config.ariaDescribedBy}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
        >
          {config.title && (
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 id="modal-dialog-title" className="text-sm font-medium text-text-primary">
                {config.title}
              </h2>
              <button
                onClick={onClose}
                className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {config.listNavigation ? (
            <ModalDialogListNavContext.Provider value={{ activeIndex, getItemProps }}>
              <FloatingList elementsRef={elementsRef} labelsRef={labelsRef}>
                <ContentComponent {...config.componentProps} onClose={onClose} />
              </FloatingList>
            </ModalDialogListNavContext.Provider>
          ) : (
            <ContentComponent {...config.componentProps} onClose={onClose} />
          )}
        </motion.div>
      </FloatingFocusManager>
    </FloatingOverlay>
  );
}
