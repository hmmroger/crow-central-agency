import type { ApiError } from "../../services/api-client.types.js";
import { getErrorMessage } from "../../utils/error-message.js";

interface NotesTreeStatusProps {
  isLoading: boolean;
  error: ApiError | undefined;
  isEmpty: boolean;
  emptyMessage: string;
  /** The tree, shown once loaded and not empty */
  children: React.ReactNode;
}

const LOADING_MESSAGE = "Loading...";

/** A sidebar tab's error line, then its loading or empty line in place of the tree. */
export function NotesTreeStatus({ isLoading, error, isEmpty, emptyMessage, children }: NotesTreeStatusProps) {
  const hasStatus = isLoading || isEmpty;
  const statusMessage = isLoading ? LOADING_MESSAGE : emptyMessage;

  return (
    <>
      {error && <p className="px-2 py-1 text-xs text-error">{getErrorMessage(error)}</p>}
      {hasStatus ? <p className="px-2 py-1 text-xs text-text-muted">{statusMessage}</p> : children}
    </>
  );
}
