import type { McpServerConfig } from "@crow-central-agency/shared";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface McpServersSectionProps {
  configs: McpServerConfig[];
  mcpServerIds: string[];
  onToggle: (serverId: string) => void;
}

/**
 * MCP server selection section in the agent editor.
 * Shows a toggle for each user-configured MCP server.
 * Only non-disabled servers are shown.
 */
export function McpServersSection({ configs, mcpServerIds, onToggle }: McpServersSectionProps) {
  const enabledConfigs = configs.filter((config) => !config.isDisabled);

  if (enabledConfigs.length === 0) {
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
        {enabledConfigs.map((config) => (
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
  config: McpServerConfig;
  checked: boolean;
  onToggle: () => void;
}

/** Single MCP server toggle row with name and type badge */
function McpServerRow({ config, checked, onToggle }: McpServerRowProps) {
  return (
    <div className="flex items-center gap-2">
      <Toggle checked={checked} onChange={onToggle} label={config.name} variant="secondary" />
      <span className="px-1 py-0.5 rounded text-3xs font-mono text-text-muted bg-surface-inset border border-border-subtle">
        {config.type}
      </span>
    </div>
  );
}
