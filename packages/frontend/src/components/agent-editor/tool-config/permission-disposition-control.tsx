import { useCallback } from "react";
import { cn } from "../../../utils/cn.js";
import { TOOL_DISPOSITION, type ToolDisposition } from "./tool-permission.js";

interface PermissionDispositionControlProps {
  disposition: ToolDisposition;
  allowClear: boolean;
  onDispositionChange: (disposition: ToolDisposition) => void;
}

/**
 * Mutually-exclusive Approve / Deny control. Clicking the inactive disposition switches to it;
 * clicking the active disposition returns the rule to Ask only when `allowClear` is true (catalog
 * rows), and is a no-op otherwise (custom rows, which are cleared via their dedicated remove button).
 */
export function PermissionDispositionControl({
  disposition,
  allowClear,
  onDispositionChange,
}: PermissionDispositionControlProps) {
  const handleApprove = useCallback(() => {
    if (disposition === TOOL_DISPOSITION.APPROVE) {
      if (allowClear) {
        onDispositionChange(TOOL_DISPOSITION.ASK);
      }

      return;
    }

    onDispositionChange(TOOL_DISPOSITION.APPROVE);
  }, [allowClear, disposition, onDispositionChange]);

  const handleDeny = useCallback(() => {
    if (disposition === TOOL_DISPOSITION.DENY) {
      if (allowClear) {
        onDispositionChange(TOOL_DISPOSITION.ASK);
      }

      return;
    }

    onDispositionChange(TOOL_DISPOSITION.DENY);
  }, [allowClear, disposition, onDispositionChange]);

  return (
    <div className="flex gap-1 shrink-0">
      <button
        type="button"
        className={cn(
          "px-2 py-1 rounded text-xs font-medium transition-colors border",
          disposition === TOOL_DISPOSITION.APPROVE
            ? "bg-success/15 text-success border-success/30"
            : "bg-surface-inset text-text-muted border-border-subtle hover:text-text-neutral"
        )}
        onClick={handleApprove}
      >
        Approve
      </button>
      <button
        type="button"
        className={cn(
          "px-2 py-1 rounded text-xs font-medium transition-colors border",
          disposition === TOOL_DISPOSITION.DENY
            ? "bg-error/15 text-error border-error/30"
            : "bg-surface-inset text-text-muted border-border-subtle hover:text-text-neutral"
        )}
        onClick={handleDeny}
      >
        Deny
      </button>
    </div>
  );
}
