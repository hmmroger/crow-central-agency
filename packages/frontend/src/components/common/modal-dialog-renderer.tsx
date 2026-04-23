import { useRef, useState, useCallback } from "react";
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
import type { ModalDialogConfig, ModalDialogHandle } from "../../providers/modal-dialog-provider.types";
import { ModalDialogListNavContext } from "../../providers/modal-dialog-list-nav-provider";

interface ModalDialogRendererProps {
  config: ModalDialogConfig;
  /** Position in the dialog stack (0-based), used for z-index layering */
  stackDepth: number;
  onClose: () => void;
}

export function ModalDialogRenderer({ config, stackDepth, onClose }: ModalDialogRendererProps) {
  const titleId = `modal-dialog-title-${config.id}`;
  const handleRef = useRef<ModalDialogHandle>(null);

  const guardedClose = useCallback(async () => {
    const canDismiss = handleRef.current?.canDismiss?.();
    const allowed = canDismiss instanceof Promise ? await canDismiss : canDismiss;
    if (allowed === false) {
      return;
    }

    onClose();
  }, [onClose]);

  const { refs, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) {
        guardedClose();
      }
    },
  });

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const elementsRef = useRef<(HTMLElement | null)[]>([]);
  const labelsRef = useRef<(string | null)[]>([]);
  const dismiss = useDismiss(context, {
    outsidePressEvent: "mousedown",
    outsidePress: (event) => {
      // Ignore clicks inside nested floating elements (context menus, tooltips)
      // but allow clicks on the modal's own overlay backdrop to dismiss.
      const target = event.target;
      if (target instanceof Element && target.closest("[role='menu']")) {
        return false;
      }

      return true;
    },
  });

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
    <FloatingOverlay
      lockScroll
      style={{ zIndex: `calc(var(--z-modal-base) + ${stackDepth} * var(--z-modal-step))` }}
      className="bg-black/50 flex items-center justify-center backdrop-blur-sm"
    >
      <FloatingFocusManager context={context} modal>
        <motion.div
          ref={refs.setFloating}
          className={cn(
            "rounded-lg bg-surface border border-border-subtle/35 shadow-elevated focus:outline-none overflow-hidden",
            config.className
          )}
          {...getFloatingProps()}
          aria-labelledby={config.title ? titleId : config.ariaLabelledBy}
          aria-describedby={config.ariaDescribedBy}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
        >
          {config.title && (
            <div className="flex items-center justify-between border-b border-border p-3">
              <h2 id={titleId} className="text-sm font-medium text-text-base">
                {config.title}
              </h2>
              <button
                onClick={guardedClose}
                className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-base"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {config.listNavigation ? (
            <ModalDialogListNavContext.Provider value={{ activeIndex, getItemProps }}>
              <FloatingList elementsRef={elementsRef} labelsRef={labelsRef}>
                <ContentComponent {...config.componentProps} ref={handleRef} onClose={onClose} />
              </FloatingList>
            </ModalDialogListNavContext.Provider>
          ) : (
            <ContentComponent {...config.componentProps} ref={handleRef} onClose={onClose} />
          )}
        </motion.div>
      </FloatingFocusManager>
    </FloatingOverlay>
  );
}
