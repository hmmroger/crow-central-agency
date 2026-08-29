import { useEffect, useRef } from "react";
import { CopyButton } from "../copy-button.js";
import { ActionButton } from "../action-button.js";
import { renderEmbedIntoHost } from "../htmlview-embed-mount.js";

interface HtmlviewEmbedDialogProps {
  /** Authored HTML source of the embed being expanded. */
  source: string;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Expanded view of an htmlview embed. Renders the source directly into its own
 * shadow root via the shared mount — no markdown round-trip, so the dialog does
 * not depend on the message pipeline that produced the embed.
 */
export function HtmlviewEmbedDialog({ source, onClose }: HtmlviewEmbedDialogProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    renderEmbedIntoHost(host, source);
  }, [source]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto m-3 rounded-md bg-surface-inset border border-border-subtle">
        <div ref={hostRef} />
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-surface-elevated">
        <CopyButton text={source} />
        <ActionButton label="Close" onClick={onClose} />
      </div>
    </div>
  );
}
