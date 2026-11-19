import { useCallback, useMemo } from "react";
import type { DiscoveredSkill } from "@crow-central-agency/shared";
import { Toggle } from "../common/toggle.js";
import { ActionButton } from "../common/action-button.js";
import { useOpenInstructionSourcesDialog } from "../../hooks/dialogs/use-open-instruction-sources-dialog.js";
import { useOpenSkillsDialog } from "../../hooks/dialogs/use-open-skills-dialog.js";
import { FieldGroup } from "./field-group.js";
import { ConfigSelectionCount } from "./config-selection-count.js";
import type { ConfigSelection } from "./agent-editor.types.js";

interface SettingSourceConfigSectionProps {
  disableFileHooks: boolean;
  instructionSources: string[];
  instructionSourceSelection: ConfigSelection;
  discoveredSkills: DiscoveredSkill[];
  skillSelection: ConfigSelection;
  /** When the preset prompt is excluded, the SDK's instructions section is dropped — only the instructions picker is inert. Skills load independently. */
  excludeSystemPrompt: boolean;
  onDisableFileHooksChange: (value: boolean) => void;
  onInstructionSourceSelectionChange: (instructionSourceSelection: ConfigSelection) => void;
  onSkillSelectionChange: (skillSelection: ConfigSelection) => void;
}

/**
 * Copilot-only controls for ambient instruction/hook sources and skills: a toggle to skip
 * `.github/hooks` file hooks, plus buttons that open multi-select dialogs for choosing which
 * instruction sources and skills the SDK discovered on the agent's last run are used.
 * Each picker only appears once a run has populated its list.
 */
export function SettingSourceConfigSection({
  disableFileHooks,
  instructionSources,
  instructionSourceSelection,
  discoveredSkills,
  skillSelection,
  excludeSystemPrompt,
  onDisableFileHooksChange,
  onInstructionSourceSelectionChange,
  onSkillSelectionChange,
}: SettingSourceConfigSectionProps) {
  const openInstructionSourcesDialog = useOpenInstructionSourcesDialog();
  const openSkillsDialog = useOpenSkillsDialog();

  const handleOpenInstructionSourcesDialog = useCallback(() => {
    openInstructionSourcesDialog({
      instructionSources,
      instructionSourceSelection,
      onSave: onInstructionSourceSelectionChange,
    });
  }, [
    openInstructionSourcesDialog,
    instructionSources,
    instructionSourceSelection,
    onInstructionSourceSelectionChange,
  ]);

  const handleOpenSkillsDialog = useCallback(() => {
    openSkillsDialog({
      discoveredSkills,
      skillSelection,
      onSave: onSkillSelectionChange,
    });
  }, [openSkillsDialog, discoveredSkills, skillSelection, onSkillSelectionChange]);

  const skillIds = useMemo(() => discoveredSkills.map((skill) => skill.name), [discoveredSkills]);
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
              Instructions: <ConfigSelectionCount itemIds={instructionSources} selection={instructionSourceSelection} />
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
              Skills: <ConfigSelectionCount itemIds={skillIds} selection={skillSelection} />
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
