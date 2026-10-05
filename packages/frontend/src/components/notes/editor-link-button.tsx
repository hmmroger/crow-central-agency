import { useCallback } from "react";
import { Link } from "lucide-react";
import { useOpenEditorLinkDialog } from "../../hooks/dialogs/use-open-editor-link-dialog.js";
import { ActionButton } from "../common/action-button.js";
import { isOutsideTableCell } from "./editor-commands.js";
import type { EditorLinkButtonProps } from "./editor-toolbar.types.js";

const LINK_LABEL = "Link";
const EDIT_LINK_LABEL = "Edit link";

/**
 * Link control. It needs a label and URL from the user, so it opens the link dialog rather than sitting in
 * the declarative command list; inside an existing link the dialog edits or removes it.
 */
export function EditorLinkButton({ editor, formatState }: EditorLinkButtonProps) {
  const openLinkDialog = useOpenEditorLinkDialog();
  const { link, selectedText } = formatState;
  const isActive = link !== undefined;
  const canRun = isOutsideTableCell(formatState);

  const handleClick = useCallback(() => {
    openLinkDialog({ editor, link, selectedText });
  }, [openLinkDialog, editor, link, selectedText]);

  return (
    <ActionButton
      icon={Link}
      label={isActive ? EDIT_LINK_LABEL : LINK_LABEL}
      iconOnly
      isActive={isActive}
      disabled={!canRun}
      onClick={handleClick}
    />
  );
}
