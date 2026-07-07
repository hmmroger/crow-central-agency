import { useCallback, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { DEFAULT_AVAILABLE_TOOLS_BY_TYPE, TOOL_MODE, type AgentType, type ToolMode } from "@crow-central-agency/shared";
import { FieldGroup } from "./field-group.js";
import { ToggleButton } from "./toggle-button.js";
import { ChipButton } from "./chip-button.js";
import { BUILTIN_TOOL_SET_BY_TYPE } from "./tool-constants.js";
import { TOOL_DISPOSITION, dispositionForRule, type ToolDisposition } from "./tool-permission.js";

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

  /** All rule rows: catalog tools first, then user-configured custom rules not in the catalog. */
  const permissionRules = useMemo(() => {
    const customRules = [...autoApprovedTools, ...disallowedTools].filter((rule) => !effectiveTools.includes(rule));
    return [...effectiveTools, ...new Set(customRules)];
  }, [autoApprovedTools, disallowedTools, effectiveTools]);

  const handleAddCustom = useCallback(() => {
    const rule = customToolInput.trim();

    if (!rule) {
      return;
    }

    onAddCustomRule(rule);
    setCustomToolInput("");
    customToolInputRef.current?.focus();
  }, [customToolInput, onAddCustomRule]);

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

  const toggleDisposition = useCallback(
    (rule: string, target: ToolDisposition) => {
      const current = dispositionForRule(rule, autoApprovedTools, disallowedTools);
      onSetToolPermission(rule, current === target ? TOOL_DISPOSITION.ASK : target);
    },
    [autoApprovedTools, disallowedTools, onSetToolPermission]
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

        <div className="space-y-1.5">
          {permissionRules.map((rule) => {
            const disposition = dispositionForRule(rule, autoApprovedTools, disallowedTools);
            return (
              <div key={rule} className="flex items-center justify-between gap-2">
                <code className="font-mono text-xs text-text-neutral truncate">{rule}</code>
                <div className="flex gap-1.5 shrink-0">
                  <ChipButton
                    label="Approve"
                    active={disposition === TOOL_DISPOSITION.APPROVE}
                    onClick={() => toggleDisposition(rule, TOOL_DISPOSITION.APPROVE)}
                  />
                  <ChipButton
                    label="Deny"
                    active={disposition === TOOL_DISPOSITION.DENY}
                    onClick={() => toggleDisposition(rule, TOOL_DISPOSITION.DENY)}
                  />
                </div>
              </div>
            );
          })}
        </div>

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
            disabled={!customToolInput.trim()}
          >
            Add
          </button>
        </div>
      </FieldGroup>
    </>
  );
}
