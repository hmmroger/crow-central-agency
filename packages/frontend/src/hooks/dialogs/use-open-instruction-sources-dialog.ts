import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { InstructionSourcesDialog } from "../../components/agent-editor/instruction-sources-dialog.js";
import type { ConfigSelection } from "../../components/agent-editor/agent-editor.types.js";

const INSTRUCTION_SOURCES_DIALOG_ID = "instruction-sources-picker";

interface OpenInstructionSourcesDialogArgs {
  instructionSources: string[];
  instructionSourceSelection: ConfigSelection;
  onSave: (instructionSourceSelection: ConfigSelection) => void;
}

export function useOpenInstructionSourcesDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(
    ({ instructionSources, instructionSourceSelection, onSave }: OpenInstructionSourcesDialogArgs) => {
      showDialog({
        id: INSTRUCTION_SOURCES_DIALOG_ID,
        component: InstructionSourcesDialog,
        componentProps: { instructionSources, instructionSourceSelection, onSave },
        title: "Manage Instruction Sources",
        className: "w-[95vw] md:w-md",
      });
    },
    [showDialog]
  );
}
