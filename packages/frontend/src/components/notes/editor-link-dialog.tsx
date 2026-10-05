import { useCallback, useState, type ChangeEvent, type SubmitEvent } from "react";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import type { EditorLinkDialogProps } from "./editor-link-dialog.types.js";

/**
 * Label and URL of a link. Adds a link over the selection, or edits and removes the link at the cursor.
 * A blank label leaves the editor to fall back to the selection or the URL.
 */
export function EditorLinkDialog({ editor, link, selectedText, onClose }: EditorLinkDialogProps) {
  const [label, setLabel] = useState(link?.text ?? selectedText ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const canSubmit = url.trim().length > 0;

  const handleLabelChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setLabel(event.target.value);
  }, []);

  const handleUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  }, []);

  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!canSubmit) {
        return;
      }

      editor.setLink(label, url);
      onClose();
    },
    [canSubmit, editor, label, url, onClose]
  );

  const handleRemove = useCallback(() => {
    editor.removeLink();
    onClose();
  }, [editor, onClose]);

  return (
    <form className="flex flex-col" onSubmit={handleSubmit}>
      <div className="p-3 space-y-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-neutral">
          Label
          <input
            type="text"
            value={label}
            onChange={handleLabelChange}
            placeholder="Link text"
            className="w-full px-3 py-1.5 rounded-md bg-surface-elevated border border-border-subtle text-sm font-normal text-text-base placeholder:text-text-muted focus:outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-neutral">
          URL
          <input
            type="text"
            autoFocus
            value={url}
            onChange={handleUrlChange}
            placeholder="https://example.com"
            className="w-full px-3 py-1.5 rounded-md bg-surface-elevated border border-border-subtle text-sm font-normal text-text-base placeholder:text-text-muted focus:outline-none focus:border-primary/50"
          />
        </label>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-elevated">
        {link && (
          <ActionButton label="Remove link" variant={ACTION_BUTTON_VARIANT.DESTRUCTIVE} onClick={handleRemove} />
        )}
        <div className="ml-auto flex gap-2">
          <ActionButton label="Cancel" onClick={onClose} />
          <ActionButton
            label={link ? "Save" : "Add"}
            variant={ACTION_BUTTON_VARIANT.PRIMARY}
            type="submit"
            disabled={!canSubmit}
          />
        </div>
      </div>
    </form>
  );
}
