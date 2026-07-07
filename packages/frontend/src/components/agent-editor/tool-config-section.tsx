import { useCallback, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  DEFAULT_AVAILABLE_TOOLS_BY_TYPE,
  TOOL_MODE,
  formatRule,
  parseRule,
  type AgentType,
  type ToolMode,
} from "@crow-central-agency/shared";
import { FieldGroup } from "./field-group.js";
import { ToggleButton } from "./toggle-button.js";
import { ChipButton } from "./chip-button.js";
import { PermissionList } from "./permission-list.js";
import { BUILTIN_TOOL_SET_BY_TYPE } from "./tool-constants.js";
import type { ToolDisposition } from "./tool-permission.js";

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
  onSetToolPermission: (rule: string, disposition: ToolDisposition) => void;
  onAddCustomRule: (rule: string) => void;
}

/**
 * Tool configuration section - tool mode toggle, tool selection,
 * and per-rule permission dispositions (approve / deny / ask).
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
  onSetToolPermission,
  onAddCustomRule,
}: ToolConfigSectionProps) {
  const [customToolInput, setCustomToolInput] = useState("");
  const customToolInputRef = useRef<HTMLInputElement>(null);

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

  /** Canonical form of the typed custom rule, or undefined when the input is empty or unparseable. */
  const canonicalCustomRule = useMemo(() => {
    const trimmed = customToolInput.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = parseRule(trimmed);
    return parsed ? formatRule(parsed) : undefined;
  }, [customToolInput]);

  const showCustomRuleError = customToolInput.trim().length > 0 && canonicalCustomRule === undefined;

  const handleAddCustom = useCallback(() => {
    if (canonicalCustomRule === undefined) {
      return;
    }

    onAddCustomRule(canonicalCustomRule);
    setCustomToolInput("");
    customToolInputRef.current?.focus();
  }, [canonicalCustomRule, onAddCustomRule]);

  const handleCustomInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setCustomToolInput(event.target.value),
    []
  );

  const handleCustomInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleAddCustom();
      }
    },
    [handleAddCustom]
  );

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

      {/* Permissions — one row per rule with mutually-exclusive Approve / Deny (neither = Ask) */}
      <FieldGroup label="Permissions">
        <p className="text-xs text-text-muted mb-2">
          Approve a rule to skip the permission dialog, or Deny to block it. No selection means Ask each time.
          Command-scoped rules are supported, e.g. Bash(git commit *).
        </p>

        <PermissionList
          effectiveTools={effectiveTools}
          autoApprovedTools={autoApprovedTools}
          disallowedTools={disallowedTools}
          onSetToolPermission={onSetToolPermission}
        />

        {/* Add custom rule input */}
        <div className="flex gap-2 mt-3">
          <input
            ref={customToolInputRef}
            type="text"
            value={customToolInput}
            onChange={handleCustomInputChange}
            onKeyDown={handleCustomInputKeyDown}
            placeholder="e.g. mcp__server__tool or Bash(git commit *)"
            className="flex-1 px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-base text-xs font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
          <button
            type="button"
            className="px-3 py-1.5 rounded-md bg-surface-elevated text-text-neutral text-xs font-medium hover:text-text-base transition-colors disabled:opacity-50"
            onClick={handleAddCustom}
            disabled={canonicalCustomRule === undefined}
          >
            Add
          </button>
        </div>

        {showCustomRuleError && <p className="text-xs text-error mt-1">Enter a valid rule, e.g. Bash(git commit *).</p>}

        {canonicalCustomRule !== undefined && canonicalCustomRule !== customToolInput.trim() && (
          <p className="text-xs text-text-muted mt-1">
            Will add: <code className="font-mono text-text-neutral">{canonicalCustomRule}</code>
          </p>
        )}
      </FieldGroup>
    </>
  );
}
