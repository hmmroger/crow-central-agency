import type { PendingPermissionRequest } from "../../hooks/agent-interaction.types.js";

interface AgentCardPermissionProps {
  permissions: PendingPermissionRequest[];
  onAllow: (toolUseId: string) => void;
  onDeny: (toolUseId: string) => void;
}

/**
 * Inline permission indicator for dashboard cards.
 * Shows a compact approve/deny UI for the first pending permission.
 */
export function AgentCardPermission({ permissions, onAllow, onDeny }: AgentCardPermissionProps) {
  if (permissions.length === 0) {
    return null;
  }

  const first = permissions[0];

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/20">
      <span className="w-2 h-2 rounded-full bg-warning animate-pulse shrink-0" />
      <span className="text-xs text-warning truncate flex-1">{first.toolName}</span>
      {permissions.length > 1 && <span className="text-xs text-text-muted">+{permissions.length - 1}</span>}
      <button
        type="button"
        className="px-2.5 py-1 rounded-md bg-success/20 text-success text-xs font-medium hover:bg-success/30 transition-colors"
        onClick={() => onAllow(first.toolUseId)}
      >
        Allow
      </button>
      <button
        type="button"
        className="px-2.5 py-1 rounded-md bg-error/20 text-error text-xs font-medium hover:bg-error/30 transition-colors"
        onClick={() => onDeny(first.toolUseId)}
      >
        Deny
      </button>
    </div>
  );
}
