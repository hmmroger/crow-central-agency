import { useRef, useState } from "react";
import { TOOL_MODE, type ToolMode } from "@crow-central-agency/shared";
import { FieldGroup } from "./field-group.js";
import { ToggleButton } from "./toggle-button.js";
import { ChipButton } from "./chip-button.js";

interface ToolConfigSectionProps {
  toolMode: ToolMode;
  selectedTools: string[];
  autoApprovedTools: string[];
  availableTools: string[];
  onToolModeChange: (mode: ToolMode) => void;
  onToggleTool: (tool: string) => void;
  onToggleAutoApproved: (tool: string) => void;
  onAddCustomAutoApproved: (toolName: string) => void;
}

/**
 * Tool configuration section — tool mode toggle, tool selection,
 * auto-approved tools, and custom tool input.
 */
export function ToolConfigSection({
  toolMode,
  selectedTools,
  autoApprovedTools,
  availableTools,
  onToolModeChange,
  onToggleTool,
  onToggleAutoApproved,
  onAddCustomAutoApproved,
}: ToolConfigSectionProps) {
  const [customToolInput, setCustomToolInput] = useState("");
  const customToolInputRef = useRef<HTMLInputElement>(null);

  /** The source of tools for auto-approved selection depends on tool mode */
  const autoApprovedSource = toolMode === TOOL_MODE.RESTRICTED ? selectedTools : availableTools;

  /** Custom tools added by user that aren't in the standard source list */
  const customOnlyTools = autoApprovedTools.filter((tool) => !autoApprovedSource.includes(tool));

  const handleAddCustom = () => {
    const toolName = customToolInput.trim();

    if (!toolName) {
      return;
    }

    onAddCustomAutoApproved(toolName);
    setCustomToolInput("");
    customToolInputRef.current?.focus();
  };

  return (
    <>
      {/* Tool Mode */}
      <FieldGroup label="Tools">
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

        {toolMode === TOOL_MODE.RESTRICTED && availableTools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableTools.map((tool) => (
              <ChipButton
                key={tool}
                label={tool}
                active={selectedTools.includes(tool)}
                onClick={() => onToggleTool(tool)}
              />
            ))}
          </div>
        )}

        {toolMode === TOOL_MODE.RESTRICTED && availableTools.length === 0 && (
          <p className="text-xs text-text-muted">
            Available tools will be populated after the agent&apos;s first query.
          </p>
        )}
      </FieldGroup>

      {/* Auto-Approved Tools */}
      <FieldGroup label="Auto-Approved Tools">
        <p className="text-xs text-text-muted mb-2">These tools skip the permission dialog.</p>

        {autoApprovedSource.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {autoApprovedSource.map((tool) => (
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
            placeholder="Add custom tool (e.g. mcp__server__tool)"
            className="flex-1 px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-xs font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
          <button
            type="button"
            className="px-3 py-1.5 rounded-md bg-surface-elevated text-text-secondary text-xs font-medium hover:text-text-primary transition-colors disabled:opacity-50"
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
