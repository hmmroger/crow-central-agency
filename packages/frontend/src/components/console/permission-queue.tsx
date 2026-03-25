import type { PendingPermissionRequest } from "../../hooks/use-agent-interaction.types.js";
import { PermissionDialog } from "./permission-dialog.js";

interface PermissionQueueProps {
  permissions: PendingPermissionRequest[];
  onAllow: (toolUseId: string) => void;
  onDeny: (toolUseId: string, message?: string) => void;
}

/**
 * Displays a stack of pending permission requests.
 * Each request gets its own PermissionDialog.
 */
export function PermissionQueue({ permissions, onAllow, onDeny }: PermissionQueueProps) {
  if (permissions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 px-4 py-2">
      {permissions.map((permission, index) => (
        <div
          key={permission.toolUseId}
          className="animate-[fade-slide-up_var(--duration-normal)_var(--ease-out)_both]"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <PermissionDialog
            toolName={permission.toolName}
            toolUseId={permission.toolUseId}
            input={permission.input}
            decisionReason={permission.decisionReason}
            onAllow={onAllow}
            onDeny={onDeny}
          />
        </div>
      ))}
    </div>
  );
}
