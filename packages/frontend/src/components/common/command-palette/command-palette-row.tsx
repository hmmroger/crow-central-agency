import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { cn } from "../../../utils/cn.js";
import type { CommandPaletteItem } from "./command-palette.types.js";

interface CommandPaletteRowProps<TValue> {
  item: CommandPaletteItem<TValue>;
  index: number;
  /** Referenced by the search input's aria-activedescendant when active */
  rowId: string;
  isActive: boolean;
  onActivate: (index: number) => void;
  onHover: (index: number) => void;
}

/**
 * One palette option. Never focusable: focus belongs to the search input, so
 * the row suppresses the focus shift a mousedown would otherwise cause.
 */
export function CommandPaletteRow<TValue>({
  item,
  index,
  rowId,
  isActive,
  onActivate,
  onHover,
}: CommandPaletteRowProps<TValue>) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  const handleMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleClick = useCallback(() => onActivate(index), [onActivate, index]);

  const handleMouseEnter = useCallback(() => onHover(index), [onHover, index]);

  return (
    <div
      ref={rowRef}
      id={rowId}
      role="option"
      aria-selected={isActive}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
        isActive ? "bg-surface-accent ring-1 ring-border-focus" : "hover:bg-surface-elevated"
      )}
    >
      {item.leading && (
        <span aria-hidden="true" className="shrink-0 flex items-center justify-center w-8 h-8 text-text-muted">
          {item.leading}
        </span>
      )}

      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-medium truncate text-text-base">{item.title}</span>
        {item.subtitle && <span className="text-xs text-text-muted truncate">{item.subtitle}</span>}
      </span>

      {item.trailing}
    </div>
  );
}
