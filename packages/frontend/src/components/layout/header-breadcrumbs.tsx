import { ChevronRight } from "lucide-react";
import type { HeaderBreadcrumb } from "../../providers/header-provider.types.js";
import { cn } from "../../utils/cn.js";

interface HeaderBreadcrumbsProps {
  breadcrumbs: HeaderBreadcrumb[];
}

/**
 * Crumbs after the header title. Ancestors give up their width before the
 * current item does, and below md only the current item is shown.
 */
export function HeaderBreadcrumbs({ breadcrumbs }: HeaderBreadcrumbsProps) {
  const lastIndex = breadcrumbs.length - 1;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex">
      <ol className="min-w-0 flex items-center gap-1">
        {breadcrumbs.map((crumb, index) => {
          const isCurrent = index === lastIndex;

          return (
            <li
              key={crumb.id}
              className={cn("min-w-0 items-center gap-1", isCurrent ? "flex" : "hidden md:flex shrink-10")}
            >
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
              {isCurrent ? (
                <span aria-current="page" className="truncate text-sm font-medium text-text-base">
                  {crumb.label}
                </span>
              ) : crumb.onClick ? (
                <button
                  type="button"
                  title={crumb.label}
                  className="min-w-0 truncate rounded-sm text-sm text-text-muted hover:text-text-base transition-colors"
                  onClick={crumb.onClick}
                >
                  {crumb.label}
                </button>
              ) : (
                <span title={crumb.label} className="truncate text-sm text-text-muted">
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
