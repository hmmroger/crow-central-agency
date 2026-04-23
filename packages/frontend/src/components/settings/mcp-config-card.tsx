import { Pencil, Trash2 } from "lucide-react";
import { MCP_CONFIG_TYPE, type McpConfigType, type McpServerConfig } from "@crow-central-agency/shared";
import { useDeleteMcpConfig } from "../../hooks/queries/use-mcp-config-mutations.js";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { cn } from "../../utils/cn.js";

interface McpConfigCardProps {
  config: McpServerConfig;
  onEdit: () => void;
}

/** Type badge label mapping */
const TYPE_LABELS: Record<McpConfigType, string> = {
  [MCP_CONFIG_TYPE.STDIO]: "stdio",
  [MCP_CONFIG_TYPE.SSE]: "sse",
  [MCP_CONFIG_TYPE.HTTP]: "http",
};

/**
 * Card for a single MCP server config in the settings list.
 * Shows name, type badge, description, disabled indicator, and edit/delete actions.
 */
export function McpConfigCard({ config, onEdit }: McpConfigCardProps) {
  const { deleteFn, isPending: isDeleting } = useDeleteMcpConfig(config.id);
  const confirm = useConfirmDialog();

  const handleDelete = () => {
    confirm({
      title: "Delete MCP Server",
      message: `Delete "${config.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: deleteFn,
    });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg border border-border-subtle/60 bg-surface transition-colors hover:border-border/80",
        config.isDisabled && "opacity-50"
      )}
    >
      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-base truncate">{config.name}</span>
          <span className="shrink-0 px-1.5 py-0.5 rounded text-3xs font-mono text-text-muted bg-surface-elevated border border-border-subtle">
            {TYPE_LABELS[config.type]}
          </span>
          {config.isDisabled && <span className="shrink-0 text-3xs text-warning">disabled</span>}
        </div>
        {config.description && <p className="text-xs text-text-muted mt-0.5 truncate">{config.description}</p>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className="p-1.5 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors disabled:opacity-40"
          onClick={onEdit}
          disabled={isDeleting}
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="p-1.5 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors disabled:opacity-40"
          onClick={handleDelete}
          disabled={isDeleting}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
