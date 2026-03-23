import { useCallback } from "react";

interface DashboardFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

/**
 * Filter bar for the dashboard — search by agent name.
 * Phase 4+ could add status filter dropdown.
 */
export function DashboardFilter({ searchQuery, onSearchChange }: DashboardFilterProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(event.target.value);
    },
    [onSearchChange]
  );

  return (
    <input
      type="text"
      value={searchQuery}
      onChange={handleChange}
      placeholder="Search agents..."
      className="px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus w-48"
    />
  );
}
