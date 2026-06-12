import { cn } from "../../utils/cn.js";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface SettingSourceConfigSectionProps {
  disableFileHooks: boolean;
  instructionSources: string[];
  disabledInstructionSources: string[];
  /** When the preset prompt is excluded, no instruction sources load at all, so the picker is inert. */
  excludeSystemPrompt: boolean;
  onDisableFileHooksChange: (value: boolean) => void;
  onToggleDisabledInstructionSource: (sourceId: string) => void;
}

/**
 * Copilot-only controls for ambient instruction/hook sources: a toggle to skip `.github/hooks`
 * file hooks, and a checkbox list to disable individual instruction sources the SDK discovered on
 * the agent's last run. The instruction list only appears once a run has populated it.
 */
export function SettingSourceConfigSection({
  disableFileHooks,
  instructionSources,
  disabledInstructionSources,
  excludeSystemPrompt,
  onDisableFileHooksChange,
  onToggleDisabledInstructionSource,
}: SettingSourceConfigSectionProps) {
  return (
    <FieldGroup label="Instruction Sources">
      <Toggle
        checked={disableFileHooks}
        onChange={onDisableFileHooksChange}
        label="Disable file-based hooks (.github/hooks)"
        variant="secondary"
      />

      {instructionSources.length > 0 && (
        <div className="mt-2">
          {excludeSystemPrompt ? (
            <p className="mb-1 text-xs text-text-muted">
              Excluding the GitHub Copilot preset drops the instructions section, so these sources won&apos;t reach the
              agent regardless of selection.
            </p>
          ) : (
            <p className="mb-1 text-xs text-text-muted">
              Check the instruction sources the agent should{" "}
              <strong className="font-semibold text-text-neutral">ignore</strong>.
            </p>
          )}
          <div
            className={cn(
              "max-h-48 overflow-y-auto rounded border border-border-subtle/40 bg-surface-inset/40 p-2",
              excludeSystemPrompt && "opacity-50"
            )}
          >
            <div className="flex flex-col gap-1.5">
              {instructionSources.map((sourceId) => (
                <label
                  key={sourceId}
                  className={cn(
                    "flex items-center gap-2 min-w-0",
                    excludeSystemPrompt ? "cursor-not-allowed" : "cursor-pointer"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={disabledInstructionSources.includes(sourceId)}
                    onChange={() => onToggleDisabledInstructionSource(sourceId)}
                    disabled={excludeSystemPrompt}
                    className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30 shrink-0 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs text-text-neutral truncate" title={sourceId}>
                    {sourceId}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </FieldGroup>
  );
}
