import { MarkdownRenderer } from "../markdown-renderer.js";
import { CopyButton } from "../copy-button.js";
import { ActionButton } from "../action-button.js";

interface MarkdownViewerDialogProps {
  /** Raw markdown/text content to display */
  content: string;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Modal content for viewing markdown with a copy button.
 */
export function MarkdownViewerDialog({ content, onClose }: MarkdownViewerDialogProps) {
  return (
    <div className="w-3xl h-[50vh] flex flex-col">
      {/* Content area with inset background */}
      <div className="flex-1 overflow-y-auto m-3 p-3 rounded-md bg-surface-inset border border-border-subtle">
        <MarkdownRenderer content={content} />
      </div>

      {/* Footer with copy + close */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-elevated">
        <CopyButton text={content} />
        <ActionButton label="Close" onClick={onClose} />
      </div>
    </div>
  );
}
