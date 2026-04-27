import { Sparkles } from "lucide-react";
import { FieldGroup } from "./field-group.js";
import { ModelSelector } from "./model-selector.js";

interface BasicInfoSectionProps {
  name: string;
  description?: string;
  workspace: string;
  model: string;
  persona?: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onWorkspaceChange: (value: string) => void;
  onModelChange: (value: string) => void;
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
  persona,
  onNameChange,
  onDescriptionChange,
  onWorkspaceChange,
  onModelChange,
  onPersonaChange,
  onGeneratePersona,
  canGenerate,
}: BasicInfoSectionProps) {
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
        <ModelSelector value={model} onChange={onModelChange} menuId="agent-editor-model" />
      </FieldGroup>

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
