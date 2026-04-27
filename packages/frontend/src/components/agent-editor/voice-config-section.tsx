import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface VoiceConfigSectionProps {
  enabled: boolean;
  voiceName: string;
  voiceStylePrompt: string;
  onEnabledChange: (enabled: boolean) => void;
  onVoiceNameChange: (value: string) => void;
  onVoiceStylePromptChange: (value: string) => void;
}

/**
 * Voice settings used when synthesizing audio for this agent's messages.
 * Hidden behind a toggle to avoid clutter — when off, the audio service
 * falls back to its provider-level defaults.
 */
export function VoiceConfigSection({
  enabled,
  voiceName,
  voiceStylePrompt,
  onEnabledChange,
  onVoiceNameChange,
  onVoiceStylePromptChange,
}: VoiceConfigSectionProps) {
  return (
    <FieldGroup label="Voice Config">
      <Toggle checked={enabled} onChange={onEnabledChange} label="Enable voice config" className="mb-2" />

      {enabled && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            Override the audio synthesis voice and style prompt. Either field may be left blank to keep the provider
            default for that field.
          </p>

          <div>
            <label className="block text-xs font-medium text-text-neutral mb-1.5">Voice Name</label>
            <input
              type="text"
              value={voiceName}
              onChange={(event) => onVoiceNameChange(event.target.value)}
              placeholder="Provider-specific voice (e.g. Sulafat)"
              className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-neutral mb-1.5">Voice Style Prompt</label>
            <textarea
              value={voiceStylePrompt}
              onChange={(event) => onVoiceStylePromptChange(event.target.value)}
              placeholder="Directorial guidance for the TTS model (tone, pacing, energy)."
              rows={4}
              className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
            />
          </div>
        </div>
      )}
    </FieldGroup>
  );
}
