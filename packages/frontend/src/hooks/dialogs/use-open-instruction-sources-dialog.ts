import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { InstructionSourcesDialog } from "../../components/agent-editor/instruction-sources-dialog.js";

const INSTRUCTION_SOURCES_DIALOG_ID = "instruction-sources-picker";

interface OpenInstructionSourcesDialogArgs {
  instructionSources: string[];
  disabledInstructionSources: string[];
  onSave: (disabledInstructionSources: string[]) => void;
}

export function useOpenInstructionSourcesDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(
    ({ instructionSources, disabledInstructionSources, onSave }: OpenInstructionSourcesDialogArgs) => {
      showDialog({
        id: INSTRUCTION_SOURCES_DIALOG_ID,
        component: InstructionSourcesDialog,
        componentProps: { instructionSources, disabledInstructionSources, onSave },
        title: "Disable Instruction Sources",
        className: "w-[95vw] md:w-md",
      });
    },
    [showDialog]
  );
}
