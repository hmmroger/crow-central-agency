import { useLayoutEffect } from "react";
import { useHeader } from "../../hooks/use-header.js";
import type { HeaderDropdownConfig } from "../../providers/header-provider.types.js";

interface HeaderPortalProps {
  /** Page/view title displayed in the header */
  title: string;
  /** Optional dropdown attached to the end of the title. Pass a memoized value to avoid churn. */
  dropdown?: HeaderDropdownConfig;
}

/**
 * Declarative header registration - renders nothing.
 * Place in a view's render tree to push the title (and optional dropdown) into the app header.
 * Uses useLayoutEffect to sync before paint, avoiding flash on view transitions.
 */
export function HeaderPortal({ title, dropdown }: HeaderPortalProps) {
  const { setTitle, setDropdown } = useHeader();

  useLayoutEffect(() => {
    setTitle(title);
  }, [setTitle, title]);

  useLayoutEffect(() => {
    setDropdown(dropdown);
    return () => setDropdown(undefined);
  }, [setDropdown, dropdown]);

  return null;
}
