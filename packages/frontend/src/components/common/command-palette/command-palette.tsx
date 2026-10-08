import { useCallback, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { useActiveIndexNav } from "../../../hooks/use-active-index-nav.js";
import type { CommandPaletteItem } from "./command-palette.types.js";
import { CommandPaletteRow } from "./command-palette-row.js";

interface CommandPaletteProps<TValue> {
  /** Base for the element ids the palette's ARIA wiring needs; unique per palette */
  idPrefix: string;
  /** Id of the sr-only heading; pass the same id as the dialog's ariaLabelledBy */
  labelId: string;
  title: string;
  inputLabel: string;
  placeholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** Runs before list navigation; call preventDefault to claim the key */
  onInputKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Changing this returns the highlight to the first row; defaults to the query */
  resetKey?: string;
  /** Content of the fixed-height row between input and list: a section label or filter controls */
  header: ReactNode;
  items: CommandPaletteItem<TValue>[];
  /** Suppresses the empty message while results are pending */
  isLoading?: boolean;
  emptyMessage: string;
  /** Shown above the rows; the consumer clears it */
  errorMessage?: string;
  onSelect: (value: TValue) => void;
}

/**
 * Fixed-size search-and-select list. Focus stays in the input for the whole
 * lifetime of the dialog; the highlighted row is published with aria-activedescendant.
 */
export function CommandPalette<TValue>({
  idPrefix,
  labelId,
  title,
  inputLabel,
  placeholder,
  query,
  onQueryChange,
  onInputKeyDown,
  resetKey,
  header,
  items,
  isLoading,
  emptyMessage,
  errorMessage,
  onSelect,
}: CommandPaletteProps<TValue>) {
  const listId = `${idPrefix}-list`;
  const rowIdPrefix = `${idPrefix}-row-`;
  const showEmptyMessage = items.length === 0 && !isLoading && !errorMessage;

  const handleCommit = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) {
        return;
      }

      onSelect(item.value);
    },
    [items, onSelect]
  );

  const { activeIndex, setActiveIndex, handleKeyDown } = useActiveIndexNav({
    itemCount: items.length,
    resetToken: resetKey ?? query,
    onCommit: handleCommit,
  });

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      onInputKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }

      handleKeyDown(event);
    },
    [onInputKeyDown, handleKeyDown]
  );

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onQueryChange(event.target.value);
    },
    [onQueryChange]
  );

  const activeRowId = items[activeIndex] ? `${rowIdPrefix}${activeIndex}` : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <h2 id={labelId} className="sr-only">
        {title}
      </h2>

      <div className="flex shrink-0 items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
        <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          aria-label={inputLabel}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeRowId}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-base placeholder:text-text-muted focus:outline-none"
        />
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1.5 px-3 pt-1">{header}</div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
        <div role="alert" className="px-1 text-sm text-error empty:hidden">
          {errorMessage}
        </div>

        <div
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          aria-busy={isLoading}
          className="flex flex-col gap-0.5"
        >
          {items.map((item, index) => (
            <CommandPaletteRow
              key={item.key}
              item={item}
              index={index}
              rowId={`${rowIdPrefix}${index}`}
              isActive={index === activeIndex}
              onActivate={handleCommit}
              onHover={setActiveIndex}
            />
          ))}
        </div>

        <div role="status" className="px-1 py-1 text-sm text-text-muted empty:hidden">
          {showEmptyMessage && emptyMessage}
        </div>
      </div>
    </div>
  );
}
