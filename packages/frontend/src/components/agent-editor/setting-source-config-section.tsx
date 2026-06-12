import { useCallback } from "react";
import type { DiscoveredSkill } from "@crow-central-agency/shared";
import { Toggle } from "../common/toggle.js";
import { ActionButton } from "../common/action-button.js";
import { useOpenInstructionSourcesDialog } from "../../hooks/dialogs/use-open-instruction-sources-dialog.js";
import { useOpenSkillsDialog } from "../../hooks/dialogs/use-open-skills-dialog.js";
import { FieldGroup } from "./field-group.js";

interface SettingSourceConfigSectionProps {
  disableFileHooks: boolean;
  instructionSources: string[];
  disabledInstructionSources: string[];
  discoveredSkills: DiscoveredSkill[];
  disabledSkills: string[];
  /** When the preset prompt is excluded, the SDK's instructions section is dropped — only the instructions picker is inert. Skills load independently. */
  excludeSystemPrompt: boolean;
  onDisableFileHooksChange: (value: boolean) => void;
  onDisabledInstructionSourcesChange: (disabledInstructionSources: string[]) => void;
  onDisabledSkillsChange: (disabledSkills: string[]) => void;
}

/**
 * Copilot-only controls for ambient instruction/hook sources and skills: a toggle to skip
 * `.github/hooks` file hooks, plus buttons that open multi-select dialogs for disabling
 * individual instruction sources and skills the SDK discovered on the agent's last run.
 * Each picker only appears once a run has populated its list.
 */
export function SettingSourceConfigSection({
  disableFileHooks,
  instructionSources,
  disabledInstructionSources,
  discoveredSkills,
  disabledSkills,
  excludeSystemPrompt,
  onDisableFileHooksChange,
  onDisabledInstructionSourcesChange,
  onDisabledSkillsChange,
}: SettingSourceConfigSectionProps) {
  const openInstructionSourcesDialog = useOpenInstructionSourcesDialog();
  const openSkillsDialog = useOpenSkillsDialog();

  const handleOpenInstructionSourcesDialog = useCallback(() => {
    openInstructionSourcesDialog({
      instructionSources,
      disabledInstructionSources,
      onSave: onDisabledInstructionSourcesChange,
    });
  }, [
    openInstructionSourcesDialog,
    instructionSources,
    disabledInstructionSources,
    onDisabledInstructionSourcesChange,
  ]);

  const handleOpenSkillsDialog = useCallback(() => {
    openSkillsDialog({
      discoveredSkills,
      disabledSkills,
      onSave: onDisabledSkillsChange,
    });
  }, [openSkillsDialog, discoveredSkills, disabledSkills, onDisabledSkillsChange]);

  const hasInstructionSources = instructionSources.length > 0;
  const hasDiscoveredSkills = discoveredSkills.length > 0;

  return (
    <FieldGroup label="Customize Config">
      <div className="flex flex-col gap-1.5">
        {excludeSystemPrompt && hasInstructionSources && (
          <p className="text-xs text-text-muted">
            Excluding the GitHub Copilot preset drops the instructions section, so these sources won&apos;t reach the
            agent regardless of selection.
          </p>
        )}

        {hasInstructionSources && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted">
              Instructions: {disabledInstructionSources.length} of {instructionSources.length} disabled
            </span>
            <ActionButton
              className="px-1.5 py-1"
              label="Manage..."
              onClick={handleOpenInstructionSourcesDialog}
              disabled={excludeSystemPrompt}
            />
          </div>
        )}

        {hasDiscoveredSkills && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted">
              Skills: {disabledSkills.length} of {discoveredSkills.length} disabled
            </span>
            <ActionButton className="px-1.5 py-1" label="Manage..." onClick={handleOpenSkillsDialog} />
          </div>
        )}

        <Toggle
          checked={disableFileHooks}
          onChange={onDisableFileHooksChange}
          label="Disable file-based hooks (.github/hooks)"
          variant="secondary"
        />
      </div>
    </FieldGroup>
  );
}
