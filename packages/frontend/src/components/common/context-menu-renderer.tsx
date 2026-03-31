import { useRef, useState, useMemo, useCallback, useLayoutEffect } from "react";
import {
  useFloating,
  useInteractions,
  useDismiss,
  useRole,
  useListNavigation,
  offset,
  flip,
  shift,
  FloatingFocusManager,
  autoUpdate,
} from "@floating-ui/react";
import type { VirtualElement } from "@floating-ui/react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "../../utils/cn";
import type { ContextMenuConfig, ContextMenuItem } from "../../providers/context-menu-provider.types";

interface ContextMenuRendererProps {
  config: ContextMenuConfig;
  onClose: () => void;
}

export function ContextMenuRenderer({ config, onClose }: ContextMenuRendererProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<(HTMLElement | null)[]>([]);

  const { refs, context, floatingStyles } = useFloating({
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    transform: false,
    open: true,
    onOpenChange: (open) => {
      if (!open) {
        onClose();
      }
    },
    placement: config.placement ?? "bottom-end",
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });

  // Apply virtual reference when config position changes
  const { x, y, anchorRect } = config;
  useLayoutEffect(() => {
    const rect = anchorRect ?? {
      x: x ?? 0,
      y: y ?? 0,
      width: 0,
      height: 0,
    };

    const virtualElement: VirtualElement = {
      getBoundingClientRect: () => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.y,
        left: rect.x,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
      }),
    };

    refs.setPositionReference(virtualElement);
  }, [anchorRect, x, y, refs]);

  // Compute disabled indices: separators, headers, disabled actions
  const disabledIndices = useMemo(
    () =>
      config.items.reduce<number[]>((acc, item, i) => {
        if (item.type === "separator" || item.type === "header" || (item.type === "action" && item.disabled)) {
          acc.push(i);
        }

        return acc;
      }, []),
    [config.items]
  );

  const dismiss = useDismiss(context, {
    outsidePress: (event) => {
      // If the click is inside the anchor rect, let the trigger handle it
      // so toggleMenu sees the menu still open and can close it
      if (anchorRect) {
        const { clientX, clientY } = event;
        if (
          clientX >= anchorRect.x &&
          clientX <= anchorRect.x + anchorRect.width &&
          clientY >= anchorRect.y &&
          clientY <= anchorRect.y + anchorRect.height
        ) {
          return false;
        }
      }

      return true;
    },
  });
  const role = useRole(context, { role: "menu" });
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
    disabledIndices,
  });

  const { getFloatingProps, getItemProps } = useInteractions([dismiss, role, listNav]);

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.type === "action" && !item.disabled) {
        onClose();
        item.onClick();
      }
    },
    [onClose]
  );

  const renderItem = (item: ContextMenuItem, index: number) => {
    switch (item.type) {
      case "separator":
        return <div key={`sep-${index}`} role="separator" className="my-1 border-t border-border" />;

      case "header":
        return (
          <div
            key={`hdr-${index}`}
            role="none"
            className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-text-muted"
          >
            {item.label}
          </div>
        );

      case "custom":
        return (
          <item.render
            key={`custom-${index}`}
            ref={(el) => {
              listRef.current[index] = el;
            }}
            {...getItemProps()}
            isActive={activeIndex === index}
            onClose={onClose}
          />
        );

      case "action": {
        const isDanger = item.variant === "danger";
        const isActive = activeIndex === index;
        const hasSelection = item.selected !== undefined;
        const isSelected = item.selected === true;
        return (
          <button
            key={`action-${index}`}
            ref={(el) => {
              listRef.current[index] = el;
            }}
            {...getItemProps({
              onClick: () => handleItemClick(item),
            })}
            disabled={item.disabled}
            role={hasSelection ? "menuitemradio" : undefined}
            aria-checked={hasSelection ? isSelected : undefined}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
              isSelected
                ? "bg-accent-muted text-accent-primary"
                : isDanger
                  ? "text-error hover:bg-error/10"
                  : "text-text-primary hover:bg-surface-hover",
              isActive && !isSelected && (isDanger ? "bg-error/10" : "bg-surface-hover"),
              item.disabled && "cursor-not-allowed opacity-50"
            )}
          >
            {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
            <span className="flex-1 truncate">{item.label}</span>
            {hasSelection && (
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-4 w-4 items-center justify-center",
                  isSelected ? "text-accent-primary" : "text-transparent"
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
        );
      }
    }
  };

  return (
    <FloatingFocusManager context={context} modal={false}>
      <motion.div
        ref={refs.setFloating}
        style={floatingStyles}
        className={cn(
          "z-50 overflow-hidden rounded-xl border border-border bg-surface-elevated p-1 shadow-xl focus:outline-none",
          config.className
        )}
        {...getFloatingProps()}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={{ duration: 0.15 }}
      >
        {config.items.map((item, i) => renderItem(item, i))}
      </motion.div>
    </FloatingFocusManager>
  );
}
