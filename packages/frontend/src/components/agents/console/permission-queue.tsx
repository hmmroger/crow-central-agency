import type { PendingPermissionInfo } from "@crow-central-agency/shared";
import { PermissionDialog } from "./permission-dialog.js";

interface PermissionQueueProps {
  permissions: PendingPermissionInfo[];
  onAllow: (toolUseId: string) => void;
  onAllowAlways: (toolUseId: string, rules?: string[]) => void;
  onDeny: (toolUseId: string, message?: string) => void;
}

/**
 * Displays a stack of pending permission requests.
 * Each request gets its own PermissionDialog.
 */
export function PermissionQueue({ permissions, onAllow, onAllowAlways, onDeny }: PermissionQueueProps) {
  if (permissions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 px-4 py-2">
      {permissions.map((permission, index) => (
        <div key={permission.toolUseId} className="animate-fade-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
          <PermissionDialog
            toolName={permission.toolName}
            toolUseId={permission.toolUseId}
            input={permission.input}
            autoApproveRules={permission.autoApproveRules}
            decisionReason={permission.decisionReason}
            onAllow={onAllow}
            onAllowAlways={onAllowAlways}
            onDeny={onDeny}
          />
        </div>
      ))}
    </div>
  );
}
