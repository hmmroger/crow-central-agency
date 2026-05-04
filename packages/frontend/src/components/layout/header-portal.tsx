import { useLayoutEffect } from "react";
import { useHeader } from "../../hooks/use-header.js";
import { EMPTY_HEADER_ACTIONS } from "../../providers/header-provider.js";
import type { HeaderAction, HeaderDropdownConfig } from "../../providers/header-provider.types.js";

interface HeaderPortalProps {
  /** Page/view title displayed in the header */
  title: string;
  /** Optional dropdown attached to the end of the title. Pass a memoized value to avoid churn. */
  dropdown?: HeaderDropdownConfig;
  /** Optional action buttons rendered on the right edge of the header below the side-panel breakpoint. Pass a memoized array. */
  actions?: HeaderAction[];
}

/**
 * Declarative header registration - renders nothing.
 * Place in a view's render tree to push the title (and optional dropdown / actions) into the app header.
 * Uses useLayoutEffect to sync before paint, avoiding flash on view transitions.
 */
export function HeaderPortal({ title, dropdown, actions }: HeaderPortalProps) {
  const { setTitle, setDropdown, setActions } = useHeader();

  useLayoutEffect(() => {
    setTitle(title);
  }, [setTitle, title]);

  useLayoutEffect(() => {
    setDropdown(dropdown);
    return () => setDropdown(undefined);
  }, [setDropdown, dropdown]);

  useLayoutEffect(() => {
    setActions(actions ?? EMPTY_HEADER_ACTIONS);
    return () => setActions(EMPTY_HEADER_ACTIONS);
  }, [setActions, actions]);

  return null;
}
