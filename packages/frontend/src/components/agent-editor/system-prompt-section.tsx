import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface SystemPromptSectionProps {
  excludeClaudeCodeSystemPrompt: boolean;
  onExcludeClaudeCodeSystemPromptChange: (value: boolean) => void;
}

/**
 * Toggle for excluding the built-in Claude Code preset system prompt.
 * When enabled, queries run with only the agent persona / AGENT.md instead
 * of appending to the Claude Code preset.
 */
export function SystemPromptSection({
  excludeClaudeCodeSystemPrompt,
  onExcludeClaudeCodeSystemPromptChange,
}: SystemPromptSectionProps) {
  return (
    <FieldGroup label="System Prompt">
      <p className="mb-1.5 text-xs text-text-muted">Skip the built-in Claude Code preset system prompt.</p>
      <Toggle
        checked={excludeClaudeCodeSystemPrompt}
        onChange={onExcludeClaudeCodeSystemPromptChange}
        label="Exclude Claude Code preset"
      />
    </FieldGroup>
  );
}
