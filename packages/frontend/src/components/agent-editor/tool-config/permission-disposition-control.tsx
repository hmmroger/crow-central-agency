import { useCallback } from "react";
import { cn } from "../../../utils/cn.js";
import { TOOL_DISPOSITION, type ToolDisposition } from "./tool-permission.js";

interface PermissionDispositionControlProps {
  disposition: ToolDisposition;
  onDispositionChange: (disposition: ToolDisposition) => void;
}

/** Mutually-exclusive Approve / Deny control; clicking the active disposition returns the rule to Ask. */
export function PermissionDispositionControl({ disposition, onDispositionChange }: PermissionDispositionControlProps) {
  const handleApprove = useCallback(() => {
    onDispositionChange(disposition === TOOL_DISPOSITION.APPROVE ? TOOL_DISPOSITION.ASK : TOOL_DISPOSITION.APPROVE);
  }, [disposition, onDispositionChange]);

  const handleDeny = useCallback(() => {
    onDispositionChange(disposition === TOOL_DISPOSITION.DENY ? TOOL_DISPOSITION.ASK : TOOL_DISPOSITION.DENY);
  }, [disposition, onDispositionChange]);

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
