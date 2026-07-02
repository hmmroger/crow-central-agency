import { useCallback, useMemo } from "react";
import { Sparkles } from "lucide-react";
import {
  AGENT_TYPE,
  THINKING_MODE,
  resolveModel,
  type AgentThinkingConfig,
  type AgentType,
  type ReasoningEffort,
  type ThinkingMode,
} from "@crow-central-agency/shared";
import { useSystemCapabilitiesQuery } from "../../hooks/queries/use-system-capabilities-query.js";
import { FieldGroup } from "./field-group.js";
import { ModelSelector } from "./model-selector.js";
import { EffortSelector } from "./effort-selector.js";
import { ThinkingSelector } from "./thinking-selector.js";

interface BasicInfoSectionProps {
  name: string;
  description?: string;
  workspace: string;
  model: string;
  effort?: ReasoningEffort;
  thinkingConfig?: AgentThinkingConfig;
  agentType: AgentType;
  persona?: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onWorkspaceChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onEffortChange: (value: ReasoningEffort | undefined) => void;
  onThinkingConfigChange: (value: AgentThinkingConfig | undefined) => void;
  onPersonaChange: (value: string) => void;
  onGeneratePersona: () => void;
  canGenerate: boolean;
}

/** Basic agent info fields: name, description, workspace, model, persona */
export function BasicInfoSection({
  name,
  description,
  workspace,
  model,
  effort,
  thinkingConfig,
  agentType,
  persona,
  onNameChange,
  onDescriptionChange,
  onWorkspaceChange,
  onModelChange,
  onEffortChange,
  onThinkingConfigChange,
  onPersonaChange,
  onGeneratePersona,
  canGenerate,
}: BasicInfoSectionProps) {
  const { data: capabilities } = useSystemCapabilitiesQuery();
  const resolvedModel = resolveModel(model);
  const modelOptions = useMemo(
    () =>
      agentType === AGENT_TYPE.GITHUB_COPILOT
        ? (capabilities?.copilotSupportedModels ?? [])
        : (capabilities?.claudeSupportedModels ?? []),
    [agentType, capabilities]
  );
  const selectedModelOption = modelOptions.find((option) => option.value === resolvedModel);
  const supportedEfforts = selectedModelOption?.supportedEfforts ?? [];
  const supportsAdaptiveThinking = selectedModelOption?.supportsAdaptiveThinking ?? false;

  const handleThinkingModeChange = useCallback(
    (mode: ThinkingMode | undefined) => {
      if (mode === undefined) {
        onThinkingConfigChange(undefined);
      } else if (mode === THINKING_MODE.ENABLED) {
        onThinkingConfigChange({ mode: THINKING_MODE.ENABLED, budget: thinkingConfig?.budget });
      } else {
        onThinkingConfigChange({ mode });
      }
    },
    [onThinkingConfigChange, thinkingConfig?.budget]
  );

  const handleThinkingBudgetChange = useCallback(
    (raw: string) => {
      const parsed = Number.parseInt(raw, 10);
      onThinkingConfigChange({ mode: THINKING_MODE.ENABLED, budget: parsed > 0 ? parsed : undefined });
    },
    [onThinkingConfigChange]
  );

  return (
    <>
      <FieldGroup label="Name" required>
        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Agent name"
          maxLength={50}
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
      </FieldGroup>

      <FieldGroup label="Description" required>
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Brief description of this agent's role or responsibility. Used for identifying responsibility between agents."
          rows={4}
          required
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
      </FieldGroup>

      <FieldGroup label="Project Path">
        <input
          type="text"
          value={workspace}
          onChange={(event) => onWorkspaceChange(event.target.value)}
          placeholder="/path/to/project (optional)"
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
      </FieldGroup>

      <FieldGroup label="Model">
        <ModelSelector value={model} agentType={agentType} onChange={onModelChange} menuId="agent-editor-model" />
      </FieldGroup>

      {supportedEfforts.length > 0 && (
        <FieldGroup label="Reasoning Effort">
          <EffortSelector
            value={effort}
            supportedEfforts={supportedEfforts}
            onChange={onEffortChange}
            menuId="agent-editor-effort"
          />
        </FieldGroup>
      )}

      {agentType === AGENT_TYPE.CLAUDE_CODE && (
        <FieldGroup label="Thinking">
          <ThinkingSelector
            value={thinkingConfig?.mode}
            supportsAdaptiveThinking={supportsAdaptiveThinking}
            onChange={handleThinkingModeChange}
            menuId="agent-editor-thinking"
          />
        </FieldGroup>
      )}

      {agentType === AGENT_TYPE.CLAUDE_CODE && thinkingConfig?.mode === THINKING_MODE.ENABLED && (
        <FieldGroup label="Thinking Budget (tokens)">
          <input
            type="number"
            min={1}
            value={thinkingConfig.budget ?? ""}
            onChange={(event) => handleThinkingBudgetChange(event.target.value)}
            placeholder="Optional token budget"
            className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
        </FieldGroup>
      )}

      <FieldGroup
        label="Persona"
        action={
          <button
            type="button"
            className="text-text-muted hover:text-secondary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-muted transition-colors"
            onClick={onGeneratePersona}
            disabled={!canGenerate}
            title={canGenerate ? "Generate with AI" : "Text generation is not configured"}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        }
      >
        <textarea
          value={persona}
          onChange={(event) => onPersonaChange(event.target.value)}
          placeholder="System-level instructions that shape agent behavior..."
          rows={4}
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
        />
      </FieldGroup>
    </>
  );
}
