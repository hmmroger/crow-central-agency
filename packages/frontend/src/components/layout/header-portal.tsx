import { useLayoutEffect } from "react";
import { useHeader } from "../../hooks/use-header.js";
import type { HeaderAction } from "../../providers/header-provider.js";

interface HeaderPortalProps {
  /** Page/view title displayed in the header nav zone */
  title: string;
  /** Action button descriptors for the header actions zone */
  actions?: HeaderAction[];
}

/**
 * Declarative header slot registration — renders nothing.
 * Place in a view's render tree to push title and actions into the app header.
 * Uses useLayoutEffect to sync before paint, avoiding flash on view transitions.
 */
export function HeaderPortal({ title, actions }: HeaderPortalProps) {
  const { setTitle, setActions } = useHeader();

  useLayoutEffect(() => {
    setTitle(title);
  }, [setTitle, title]);

  useLayoutEffect(() => {
    setActions(actions ?? []);
  }, [setActions, actions]);

  return null;
}
