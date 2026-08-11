import { GitBranch, X } from "lucide-react";

interface BranchAnchorNoticeProps {
  /** Clears the pending branch, returning the composer to the active session. */
  onCancel: () => void;
  /** Mirrors the composer variant so the notice lines up with the input below it. */
  variant?: "full" | "compact";
}

/**
 * Strip shown above the compose box while it is anchored at a message.
 * States the pending truncation so the branch needs no separate confirmation.
 */
export function BranchAnchorNotice({ onCancel, variant = "full" }: BranchAnchorNoticeProps) {
  const notice = (
    <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-elevated/50 px-2 py-1.5">
      <GitBranch className="h-3 w-3 shrink-0 text-primary" />
      <span className="flex-1 text-2xs text-text-muted">
        Branching from the selected message &mdash; everything after it is discarded when you send.
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center justify-center h-5 w-5 rounded text-text-muted hover:text-text-neutral hover:bg-surface-elevated/50 transition-colors"
        aria-label="Cancel branching"
        title="Cancel branching"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );

  if (variant === "compact") {
    return <div className="pb-1.5">{notice}</div>;
  }

  return (
    <div className="px-3 pt-2">
      <div className="max-w-3xl mx-auto">{notice}</div>
    </div>
  );
}
