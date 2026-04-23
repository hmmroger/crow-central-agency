import { cn } from "../../utils/cn.js";

interface PanelResizeHandleProps {
  /** Pointer down handler from useResizablePanel */
  onPointerDown: (event: React.PointerEvent) => void;
  /** Keyboard handler from useResizablePanel */
  onKeyDown: (event: React.KeyboardEvent) => void;
  /** Additional class names */
  className?: string;
}

/**
 * Thin vertical drag handle for resizable panels.
 * Highlights on hover/active/focus with primary accent color.
 */
export function PanelResizeHandle({ onPointerDown, onKeyDown, className }: PanelResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        "w-1 shrink-0 cursor-col-resize bg-transparent",
        "hover:bg-primary/30 active:bg-primary/50",
        "focus:bg-primary/40 focus:outline-none",
        "transition-colors duration-150",
        className
      )}
    />
  );
}
