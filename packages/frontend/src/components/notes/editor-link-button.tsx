import { useCallback } from "react";
import { Link } from "lucide-react";
import { usePromptDialog } from "../../hooks/dialogs/use-prompt-dialog.js";
import { ActionButton } from "../common/action-button.js";
import { isOutsideTableCell } from "./editor-commands.js";
import type { EditorLinkButtonProps } from "./editor-toolbar.types.js";

const LINK_LABEL = "Link";
const UNLINK_LABEL = "Remove link";

/**
 * Link control. It needs a URL from the user, so it owns a prompt dialog rather
 * than sitting in the declarative command list; clicking inside an existing link unlinks it.
 */
export function EditorLinkButton({ editor, formatState }: EditorLinkButtonProps) {
  const prompt = usePromptDialog();
  const isActive = formatState.isLink;
  const canRun = isOutsideTableCell(formatState);

  const handleConfirm = useCallback(
    (url: string) => {
      editor.insertLink(url);
    },
    [editor]
  );

  const handleClick = useCallback(() => {
    if (isActive) {
      editor.removeLink();

      return;
    }

    prompt({
      title: "Add link",
      label: "URL",
      placeholder: "https://example.com",
      confirmLabel: "Add",
      onConfirm: handleConfirm,
    });
  }, [isActive, editor, prompt, handleConfirm]);

  return (
    <ActionButton
      icon={Link}
      label={isActive ? UNLINK_LABEL : LINK_LABEL}
      iconOnly
      isActive={isActive}
      disabled={!canRun}
      onClick={handleClick}
    />
  );
}
