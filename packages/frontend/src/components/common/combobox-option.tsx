import { useCallback, type MouseEvent, type ReactNode } from "react";
import { cn } from "../../utils/cn.js";

interface ComboboxOptionProps {
  index: number;
  isActive: boolean;
  onActivate: (index: number) => void;
  onCommit: (index: number) => void;
  children: ReactNode;
}

/** One row in a ComboboxDropdown. Its mousedown is prevented so clicking never moves focus out of the input. */
export function ComboboxOption({ index, isActive, onActivate, onCommit, children }: ComboboxOptionProps) {
  const handleMouseDown = useCallback((event: MouseEvent) => event.preventDefault(), []);
  const handleMouseEnter = useCallback(() => onActivate(index), [index, onActivate]);
  const handleClick = useCallback(() => onCommit(index), [index, onCommit]);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        isActive ? "bg-surface-hover text-text-base" : "text-text-neutral"
      )}
    >
      {children}
    </button>
  );
}
