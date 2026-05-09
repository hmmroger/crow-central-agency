import type { AgentMcpConfig } from "../../hooks/queries/use-agent-mcp-configs-query.js";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface McpServersSectionProps {
  configs: AgentMcpConfig[];
  mcpServerIds: string[];
  onToggle: (serverId: string) => void;
}

/**
 * MCP server selection section in the agent editor.
 * Shows a toggle for each user-configured MCP server.
 */
export function McpServersSection({ configs, mcpServerIds, onToggle }: McpServersSectionProps) {
  if (configs.length === 0) {
    return (
      <FieldGroup label="MCP Servers">
        <p className="text-xs text-text-muted">No MCP servers configured. Add servers in Settings.</p>
      </FieldGroup>
    );
  }

  return (
    <FieldGroup label="MCP Servers">
      <p className="mb-1.5 text-xs text-text-muted">External MCP servers available to this agent.</p>
      <div className="flex flex-col gap-1.5">
        {configs.map((config) => (
          <McpServerRow
            key={config.id}
            config={config}
            checked={mcpServerIds.includes(config.id)}
            onToggle={() => onToggle(config.id)}
          />
        ))}
      </div>
    </FieldGroup>
  );
}

interface McpServerRowProps {
  config: AgentMcpConfig;
  checked: boolean;
  onToggle: () => void;
}

function McpServerRow({ config, checked, onToggle }: McpServerRowProps) {
  const isDisabled = config.isDisabled ?? false;
  return (
    <div className="flex items-center gap-2">
      <Toggle
        checked={checked}
        onChange={onToggle}
        label={config.displayName ?? config.name}
        variant="secondary"
        disabled={isDisabled}
      />
      <span className="px-1 py-0.5 rounded text-3xs font-mono text-text-muted bg-surface-inset border border-border-subtle">
        {config.type}
      </span>
      {isDisabled && <span className="text-3xs text-text-muted">Needs connection</span>}
    </div>
  );
}
