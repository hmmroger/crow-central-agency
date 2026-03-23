import { Search } from "lucide-react";

interface DashboardFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

/**
 * Filter bar for the dashboard — search by agent name/description.
 */
export function DashboardFilter({ searchQuery, onSearchChange }: DashboardFilterProps) {
  return (
    <div className="relative">
      <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        type="text"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search agents..."
        className="pl-8 pr-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus w-48"
      />
    </div>
  );
}
