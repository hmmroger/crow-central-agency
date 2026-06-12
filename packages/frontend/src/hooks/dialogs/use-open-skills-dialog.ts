import { useCallback } from "react";
import type { DiscoveredSkill } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { SkillsDialog } from "../../components/agent-editor/skills-dialog.js";

const SKILLS_DIALOG_ID = "skills-picker";

interface OpenSkillsDialogArgs {
  discoveredSkills: DiscoveredSkill[];
  disabledSkills: string[];
  onSave: (disabledSkills: string[]) => void;
}

export function useOpenSkillsDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(
    ({ discoveredSkills, disabledSkills, onSave }: OpenSkillsDialogArgs) => {
      showDialog({
        id: SKILLS_DIALOG_ID,
        component: SkillsDialog,
        componentProps: { discoveredSkills, disabledSkills, onSave },
        title: "Disable Skills",
        className: "w-[95vw] md:w-md",
      });
    },
    [showDialog]
  );
}
