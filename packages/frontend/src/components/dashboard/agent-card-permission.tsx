import type { PendingPermissionRequest } from "../../hooks/use-agent-interaction.types.js";

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
    <div className="flex items-center gap-2 p-1.5 rounded bg-warning/10 border border-warning/20">
      <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" />
      <span className="text-xs text-warning truncate flex-1">{first.toolName}</span>
      {permissions.length > 1 && <span className="text-xs text-text-muted">+{permissions.length - 1}</span>}
      <button
        type="button"
        className="px-1.5 py-0.5 rounded bg-success/20 text-success text-xs hover:bg-success/30 transition-colors"
        onClick={() => onAllow(first.toolUseId)}
      >
        Allow
      </button>
      <button
        type="button"
        className="px-1.5 py-0.5 rounded bg-error/20 text-error text-xs hover:bg-error/30 transition-colors"
        onClick={() => onDeny(first.toolUseId)}
      >
        Deny
      </button>
    </div>
  );
}
