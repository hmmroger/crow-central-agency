import { useCallback, useMemo } from "react";
import { DEFAULT_AVAILABLE_TOOLS_BY_TYPE, TOOL_MODE, type AgentType, type ToolMode } from "@crow-central-agency/shared";
import { ActionButton } from "../common/action-button.js";
import { useOpenPermissionsDialog } from "../../hooks/dialogs/use-open-permissions-dialog.js";
import { FieldGroup } from "./field-group.js";
import { ToggleButton } from "./toggle-button.js";
import { ChipButton } from "./chip-button.js";
import { BUILTIN_TOOL_SET_BY_TYPE } from "./tool-constants.js";

/**
 * Whether a provider supports restricting the builtin tool set. Both Claude Code and Copilot
 * honor the "restricted" mode: each runner gates its own builtin catalog to the selected tools.
 */
function supportsToolRestriction(_type: AgentType): boolean {
  return true;
}

interface ToolConfigSectionProps {
  agentType: AgentType;
  toolMode: ToolMode;
  selectedTools: string[];
  autoApprovedTools: string[];
  disallowedTools: string[];
  availableTools: string[];
  onToolModeChange: (mode: ToolMode) => void;
  onToggleTool: (tool: string) => void;
  onSetPermissions: (autoApprovedTools: string[], disallowedTools: string[]) => void;
}

/**
 * Tool configuration section - tool availability mode/selection plus a summary of the agent's
 * permission rules with a button that opens the second-level permissions dialog.
 */
export function ToolConfigSection({
  agentType,
  toolMode,
  selectedTools,
  autoApprovedTools,
  disallowedTools,
  availableTools,
  onToolModeChange,
  onToggleTool,
  onSetPermissions,
}: ToolConfigSectionProps) {
  const openPermissionsDialog = useOpenPermissionsDialog();

  const builtinTools = DEFAULT_AVAILABLE_TOOLS_BY_TYPE[agentType];
  const builtinToolSet = BUILTIN_TOOL_SET_BY_TYPE[agentType];
  const canRestrictTools = supportsToolRestriction(agentType);

  /**
   * Effective tool set for permission selection. Reflects the user's current intent,
   * not just the last SDK snapshot:
   * - Builtins come from selectedTools (restricted) or the provider catalog (unrestricted).
   * - External tools (MCP, etc.) come from availableTools.
   */
  const effectiveTools = useMemo(() => {
    const restricted = canRestrictTools && toolMode === TOOL_MODE.RESTRICTED;
    const builtinSource = restricted ? selectedTools : builtinTools;
    const externalTools = availableTools.filter((tool) => !builtinToolSet.has(tool));
    return [...builtinSource, ...externalTools];
  }, [canRestrictTools, toolMode, selectedTools, availableTools, builtinTools, builtinToolSet]);

  const handleManagePermissions = useCallback(() => {
    openPermissionsDialog({ effectiveTools, autoApprovedTools, disallowedTools, onSave: onSetPermissions });
  }, [openPermissionsDialog, effectiveTools, autoApprovedTools, disallowedTools, onSetPermissions]);

  return (
    <>
      {/* Tool Mode — only providers that support restricting builtins expose this toggle */}
      {canRestrictTools && (
        <FieldGroup label="Tools">
          <p className="text-xs text-text-muted mb-2">Controls which builtin tools are available to the agent.</p>
          <div className="flex gap-2 mb-3">
            <ToggleButton
              active={toolMode === TOOL_MODE.UNRESTRICTED}
              onClick={() => onToolModeChange(TOOL_MODE.UNRESTRICTED)}
              label="Unrestricted"
            />
            <ToggleButton
              active={toolMode === TOOL_MODE.RESTRICTED}
              onClick={() => onToolModeChange(TOOL_MODE.RESTRICTED)}
              label="Restricted"
            />
          </div>

          {toolMode === TOOL_MODE.RESTRICTED && (
            <div className="flex flex-wrap gap-1.5">
              {builtinTools.map((tool) => (
                <ChipButton
                  key={tool}
                  label={tool}
                  active={selectedTools.includes(tool)}
                  onClick={() => onToggleTool(tool)}
                />
              ))}
            </div>
          )}
        </FieldGroup>
      )}

      {/* Permissions — managed in a second-level dialog to keep the editor compact */}
      <FieldGroup label="Permissions">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-text-muted">
            {autoApprovedTools.length} approved · {disallowedTools.length} denied
          </span>
          <ActionButton className="px-1.5 py-1" label="Manage..." onClick={handleManagePermissions} />
        </div>
      </FieldGroup>
    </>
  );
}
