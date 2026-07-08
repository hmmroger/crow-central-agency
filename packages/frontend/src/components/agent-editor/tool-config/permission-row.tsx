import { useCallback } from "react";
import { X } from "lucide-react";
import { PermissionDispositionControl } from "./permission-disposition-control.js";
import type { ToolDisposition } from "./tool-permission.js";

interface PermissionRowProps {
  rule: string;
  displayName: string;
  disposition: ToolDisposition;
  removable: boolean;
  onDispositionChange: (rule: string, disposition: ToolDisposition) => void;
  onRemove: (rule: string) => void;
}

/** A single permission rule with its Approve / Deny control; custom rows can be removed. */
export function PermissionRow({
  rule,
  displayName,
  disposition,
  removable,
  onDispositionChange,
  onRemove,
}: PermissionRowProps) {
  const handleDispositionChange = useCallback(
    (next: ToolDisposition) => onDispositionChange(rule, next),
    [onDispositionChange, rule]
  );

  const handleRemove = useCallback(() => onRemove(rule), [onRemove, rule]);

  return (
    <div className="flex items-center justify-between gap-2">
      <code className="font-mono text-xs text-text-neutral truncate">{displayName}</code>
      <div className="flex items-center gap-1.5 shrink-0">
        <PermissionDispositionControl disposition={disposition} onDispositionChange={handleDispositionChange} />
        {removable && (
          <button
            type="button"
            className="p-1 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors"
            onClick={handleRemove}
            title={`Remove ${rule}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
