import { NOTE_PALETTE_FILTERS, type NotePaletteFilter } from "./note-palette.types.js";
import { NotePaletteFilterPill } from "./note-palette-filter-pill.js";

interface NotePaletteFilterPillsProps {
  filter: NotePaletteFilter;
  onFilterChange: (filter: NotePaletteFilter) => void;
}

export function NotePaletteFilterPills({ filter, onFilterChange }: NotePaletteFilterPillsProps) {
  return (
    <div role="group" aria-label="Filter results" className="flex items-center gap-1">
      {NOTE_PALETTE_FILTERS.map((pillFilter) => (
        <NotePaletteFilterPill
          key={pillFilter}
          filter={pillFilter}
          isSelected={pillFilter === filter}
          onSelect={onFilterChange}
        />
      ))}
    </div>
  );
}
