import { useLayoutEffect } from "react";
import { useHeader } from "../../hooks/use-header.js";

interface HeaderPortalProps {
  /** Page/view title displayed in the header */
  title: string;
}

/**
 * Declarative header title registration — renders nothing.
 * Place in a view's render tree to push the title into the app header.
 * Uses useLayoutEffect to sync before paint, avoiding flash on view transitions.
 */
export function HeaderPortal({ title }: HeaderPortalProps) {
  const { setTitle } = useHeader();

  useLayoutEffect(() => {
    setTitle(title);
  }, [setTitle, title]);

  return null;
}
