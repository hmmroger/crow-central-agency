import { Sparkles } from "lucide-react";
import { CLAUDE_CODE_MODEL_OPTIONS } from "@crow-central-agency/shared";
import { FieldGroup } from "./field-group.js";

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
}: BasicInfoSectionProps) {
  return (
    <>
      <FieldGroup label="Name">
        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Agent name"
          maxLength={50}
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
      </FieldGroup>

      <FieldGroup label="Description">
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Brief description of this agent's role or responsibility"
          rows={4}
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
      </FieldGroup>

      <FieldGroup label="Workspace Path">
        <input
          type="text"
          value={workspace}
          onChange={(event) => onWorkspaceChange(event.target.value)}
          placeholder="/path/to/workspace"
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
      </FieldGroup>

      <FieldGroup label="Model">
        <select
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-border-focus"
        >
          {CLAUDE_CODE_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FieldGroup>

      <FieldGroup
        label="Persona"
        action={
          <button
            type="button"
            className="text-text-muted hover:text-secondary transition-colors"
            onClick={onGeneratePersona}
            title="Generate with AI"
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
          className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
        />
      </FieldGroup>
    </>
  );
}
