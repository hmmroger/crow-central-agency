import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { FeedAddDialogContent } from "../../components/settings/feed-add-dialog-content.js";

const FEED_ADD_DIALOG_ID = "feed-add";

/**
 * Hook to open the feed add dialog as a modal.
 *
 * @returns A function that opens the add feed dialog.
 */
export function useOpenFeedAddDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(() => {
    showDialog({
      id: FEED_ADD_DIALOG_ID,
      title: "Add Feed",
      component: FeedAddDialogContent,
      componentProps: {},
      className: "w-(--width-editor-dialog) max-w-lg max-h-(--max-height-editor-dialog) flex flex-col",
    });
  }, [showDialog]);
}
