import { useCallback, type MouseEvent } from "react";
import { cn } from "../../utils/cn.js";
import { DOCUMENT_PALETTE_FILTER_LABEL, type DocumentPaletteFilter } from "./document-palette.types.js";

interface DocumentPaletteFilterPillProps {
  filter: DocumentPaletteFilter;
  isSelected: boolean;
  onSelect: (filter: DocumentPaletteFilter) => void;
}

/** Keeps focus in the palette's search input when a pill is clicked */
function preventFocusShift(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

export function DocumentPaletteFilterPill({ filter, isSelected, onSelect }: DocumentPaletteFilterPillProps) {
  const handleClick = useCallback(() => onSelect(filter), [onSelect, filter]);

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-pressed={isSelected}
      onMouseDown={preventFocusShift}
      onClick={handleClick}
      className={cn(
        "px-2 py-0.5 rounded-full text-3xs uppercase tracking-wider transition-colors",
        isSelected ? "bg-surface-accent text-text-base" : "text-text-muted hover:text-text-base hover:bg-surface-hover"
      )}
    >
      {DOCUMENT_PALETTE_FILTER_LABEL[filter]}
    </button>
  );
}
