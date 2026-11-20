import { useCallback } from "react";
import type { DiscoveredSkill } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { SkillsDialog } from "../../components/agent-editor/skills-dialog.js";
import type { ConfigSelection } from "../../components/agent-editor/agent-editor.types.js";

const SKILLS_DIALOG_ID = "skills-picker";

interface OpenSkillsDialogArgs {
  discoveredSkills: DiscoveredSkill[];
  skillSelection: ConfigSelection;
  onSave: (skillSelection: ConfigSelection) => void;
}

export function useOpenSkillsDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(
    ({ discoveredSkills, skillSelection, onSave }: OpenSkillsDialogArgs) => {
      showDialog({
        id: SKILLS_DIALOG_ID,
        component: SkillsDialog,
        componentProps: { discoveredSkills, skillSelection, onSave },
        title: "Manage Skills",
        className: "w-[95vw] md:w-md",
      });
    },
    [showDialog]
  );
}
