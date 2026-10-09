import { DOCUMENT_PALETTE_FILTERS, type DocumentPaletteFilter } from "./document-palette.types.js";
import { DocumentPaletteFilterPill } from "./document-palette-filter-pill.js";

interface DocumentPaletteFilterPillsProps {
  filter: DocumentPaletteFilter;
  onFilterChange: (filter: DocumentPaletteFilter) => void;
}

export function DocumentPaletteFilterPills({ filter, onFilterChange }: DocumentPaletteFilterPillsProps) {
  return (
    <div role="group" aria-label="Filter results" className="flex items-center gap-1">
      {DOCUMENT_PALETTE_FILTERS.map((pillFilter) => (
        <DocumentPaletteFilterPill
          key={pillFilter}
          filter={pillFilter}
          isSelected={pillFilter === filter}
          onSelect={onFilterChange}
        />
      ))}
    </div>
  );
}
