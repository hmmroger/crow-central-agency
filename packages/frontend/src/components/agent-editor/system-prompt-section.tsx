import { AGENT_TYPE, type AgentType } from "@crow-central-agency/shared";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface SystemPromptSectionProps {
  excludeClaudeCodeSystemPrompt: boolean;
  agentType: AgentType;
  onExcludeClaudeCodeSystemPromptChange: (value: boolean) => void;
}

/**
 * Toggle for excluding the built-in agent preset system prompt.
 * When enabled, queries run with only the agent persona / AGENT.md instead
 * of appending to the preset.
 */
export function SystemPromptSection({
  excludeClaudeCodeSystemPrompt,
  agentType,
  onExcludeClaudeCodeSystemPromptChange,
}: SystemPromptSectionProps) {
  return (
    <FieldGroup label="System Prompt">
      <p className="mb-1.5 text-xs text-text-muted">Skip the built-in agent preset system prompt.</p>
      <Toggle
        checked={excludeClaudeCodeSystemPrompt}
        onChange={onExcludeClaudeCodeSystemPromptChange}
        label={`Exclude ${agentType === AGENT_TYPE.CLAUDE_CODE ? "Claude Code" : "GitHub Copilot"} preset`}
      />
    </FieldGroup>
  );
}
