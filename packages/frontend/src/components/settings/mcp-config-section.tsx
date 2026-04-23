import { Plus, RefreshCw } from "lucide-react";
import { useMcpConfigsQuery } from "../../hooks/queries/use-mcp-configs-query.js";
import { useOpenMcpConfigEditor } from "../../hooks/dialogs/use-open-mcp-config-editor.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { McpConfigCard } from "./mcp-config-card.js";

/**
 * MCP Server Configuration section within the Settings view.
 * Lists user-configured MCP servers with add/edit/delete actions.
 */
export function McpConfigSection() {
  const { data: configs = [], isLoading, error, refetch } = useMcpConfigsQuery();
  const openEditor = useOpenMcpConfigEditor();

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-base">MCP Servers</h3>
        <ActionButton
          icon={Plus}
          label="Add Server"
          onClick={() => openEditor()}
          variant={ACTION_BUTTON_VARIANT.PRIMARY_SOLID}
        />
      </div>

      {/* Loading */}
      {isLoading && <p className="text-sm text-text-muted">Loading MCP configs...</p>}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm">
          <span className="flex-1">{error.message}</span>
          <button
            type="button"
            className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
            onClick={() => void refetch()}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && configs.length === 0 && (
        <p className="text-sm text-text-muted">
          No MCP servers configured. Click &quot;Add Server&quot; to get started.
        </p>
      )}

      {/* Config list */}
      {configs.length > 0 && (
        <div className="space-y-2">
          {configs.map((config) => (
            <McpConfigCard key={config.id} config={config} onEdit={() => openEditor(config.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
