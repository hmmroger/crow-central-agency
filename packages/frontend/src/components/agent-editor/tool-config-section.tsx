import { useMemo, useRef, useState } from "react";
import { DEFAULT_AVAILABLE_TOOLS_BY_TYPE, TOOL_MODE, type AgentType, type ToolMode } from "@crow-central-agency/shared";
import { Toggle } from "../common/toggle.js";
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
  disallowedToolsEnabled: boolean;
  availableTools: string[];
  onToolModeChange: (mode: ToolMode) => void;
  onToggleTool: (tool: string) => void;
  onToggleAutoApproved: (tool: string) => void;
  onAddCustomAutoApproved: (toolName: string) => void;
  onDisallowedToolsEnabledChange: (enabled: boolean) => void;
  onToggleDisallowedTool: (tool: string) => void;
  onAddCustomDisallowedTool: (toolName: string) => void;
}

/**
 * Tool configuration section - tool mode toggle, tool selection,
 * auto-approved tools, and custom tool input.
 */
export function ToolConfigSection({
  agentType,
  toolMode,
  selectedTools,
  autoApprovedTools,
  disallowedTools,
  disallowedToolsEnabled,
  availableTools,
  onToolModeChange,
  onToggleTool,
  onToggleAutoApproved,
  onAddCustomAutoApproved,
  onDisallowedToolsEnabledChange,
  onToggleDisallowedTool,
  onAddCustomDisallowedTool,
}: ToolConfigSectionProps) {
  const [customToolInput, setCustomToolInput] = useState("");
  const customToolInputRef = useRef<HTMLInputElement>(null);
  const [customDisallowedInput, setCustomDisallowedInput] = useState("");
  const customDisallowedInputRef = useRef<HTMLInputElement>(null);

  const builtinTools = DEFAULT_AVAILABLE_TOOLS_BY_TYPE[agentType];
  const builtinToolSet = BUILTIN_TOOL_SET_BY_TYPE[agentType];
  const canRestrictTools = supportsToolRestriction(agentType);

  /**
   * Effective tool set for auto-approved and disallowed selection. Reflects
   * the user's current intent, not just the last SDK snapshot:
   * - Builtins come from selectedTools (restricted) or the provider catalog (unrestricted).
   * - External tools (MCP, etc.) come from availableTools.
   */
  const effectiveTools = useMemo(() => {
    const restricted = canRestrictTools && toolMode === TOOL_MODE.RESTRICTED;
    const builtinSource = restricted ? selectedTools : builtinTools;
    const externalTools = availableTools.filter((tool) => !builtinToolSet.has(tool));
    return [...builtinSource, ...externalTools];
  }, [canRestrictTools, toolMode, selectedTools, availableTools, builtinTools, builtinToolSet]);

  /** Custom tools added by user that aren't in the standard source list */
  const customOnlyTools = autoApprovedTools.filter((tool) => !effectiveTools.includes(tool));

  const handleAddCustom = () => {
    const toolName = customToolInput.trim();

    if (!toolName) {
      return;
    }

    onAddCustomAutoApproved(toolName);
    setCustomToolInput("");
    customToolInputRef.current?.focus();
  };

  const handleAddCustomDisallowed = () => {
    const toolName = customDisallowedInput.trim();

    if (!toolName) {
      return;
    }

    onAddCustomDisallowedTool(toolName);
    setCustomDisallowedInput("");
    customDisallowedInputRef.current?.focus();
  };

  /** Custom disallowed tools added by user that aren't in the effective tools list */
  const customDisallowedOnly = disallowedTools.filter((tool) => !effectiveTools.includes(tool));

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

      {/* Auto-Approved Tools */}
      <FieldGroup label="Auto-Approved Tools">
        <p className="text-xs text-text-muted mb-2">
          These tools skip the permission dialog. Command-scoped rules are supported, e.g. Bash(git commit *).
        </p>

        {effectiveTools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {effectiveTools.map((tool) => (
              <ChipButton
                key={tool}
                label={tool}
                active={autoApprovedTools.includes(tool)}
                onClick={() => onToggleAutoApproved(tool)}
              />
            ))}
          </div>
        )}

        {customOnlyTools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {customOnlyTools.map((tool) => (
              <ChipButton key={tool} label={tool} active onClick={() => onToggleAutoApproved(tool)} />
            ))}
          </div>
        )}

        {/* Add custom tool input */}
        <div className="flex gap-2">
          <input
            ref={customToolInputRef}
            type="text"
            value={customToolInput}
            onChange={(event) => setCustomToolInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddCustom();
              }
            }}
            placeholder="e.g. mcp__server__tool or Bash(git commit *)"
            className="flex-1 px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-base text-xs font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
          <button
            type="button"
            className="px-3 py-1.5 rounded-md bg-surface-elevated text-text-neutral text-xs font-medium hover:text-text-base transition-colors disabled:opacity-50"
            onClick={handleAddCustom}
            disabled={!customToolInput.trim()}
          >
            Add
          </button>
        </div>
      </FieldGroup>

      {/* Disallowed Tools */}
      <FieldGroup label="Disallowed Tools">
        <Toggle
          checked={disallowedToolsEnabled}
          onChange={onDisallowedToolsEnabledChange}
          label="Enable disallowed tools"
          className="mb-2"
        />

        {disallowedToolsEnabled && (
          <>
            <p className="text-xs text-text-muted mb-2">
              These tools are blocked from use, even if they would otherwise be allowed.
            </p>

            {effectiveTools.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {effectiveTools.map((tool) => (
                  <ChipButton
                    key={tool}
                    label={tool}
                    active={disallowedTools.includes(tool)}
                    onClick={() => onToggleDisallowedTool(tool)}
                  />
                ))}
              </div>
            )}

            {customDisallowedOnly.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {customDisallowedOnly.map((tool) => (
                  <ChipButton key={tool} label={tool} active onClick={() => onToggleDisallowedTool(tool)} />
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                ref={customDisallowedInputRef}
                type="text"
                value={customDisallowedInput}
                onChange={(event) => setCustomDisallowedInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddCustomDisallowed();
                  }
                }}
                placeholder="Add custom tool (e.g. mcp__server__tool)"
                className="flex-1 px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-base text-xs font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
              <button
                type="button"
                className="px-3 py-1.5 rounded-md bg-surface-elevated text-text-neutral text-xs font-medium hover:text-text-base transition-colors disabled:opacity-50"
                onClick={handleAddCustomDisallowed}
                disabled={!customDisallowedInput.trim()}
              >
                Add
              </button>
            </div>
          </>
        )}
      </FieldGroup>
    </>
  );
}
