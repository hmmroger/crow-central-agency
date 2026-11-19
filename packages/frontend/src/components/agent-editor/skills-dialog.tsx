import { useMemo } from "react";
import type { DiscoveredSkill } from "@crow-central-agency/shared";
import { ConfigSelectionDialog } from "./config-selection-dialog.js";
import type { ConfigSelection } from "./agent-editor.types.js";

interface SkillsDialogProps {
  discoveredSkills: DiscoveredSkill[];
  skillSelection: ConfigSelection;
  onSave: (skillSelection: ConfigSelection) => void;
  onClose: () => void;
}

export function SkillsDialog({ discoveredSkills, skillSelection, onSave, onClose }: SkillsDialogProps) {
  const items = useMemo(
    () =>
      discoveredSkills.map((skill) => ({
        key: `${skill.source}::${skill.name}`,
        id: skill.name,
        label: skill.name,
        detail: skill.source,
      })),
    [discoveredSkills]
  );

  return (
    <ConfigSelectionDialog
      items={items}
      selection={skillSelection}
      itemNoun="skills"
      onSave={onSave}
      onClose={onClose}
    />
  );
}
