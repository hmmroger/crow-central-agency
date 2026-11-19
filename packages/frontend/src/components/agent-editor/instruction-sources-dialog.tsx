import { useMemo } from "react";
import { ConfigSelectionDialog } from "./config-selection-dialog.js";
import type { ConfigSelection } from "./agent-editor.types.js";

interface InstructionSourcesDialogProps {
  instructionSources: string[];
  instructionSourceSelection: ConfigSelection;
  onSave: (instructionSourceSelection: ConfigSelection) => void;
  onClose: () => void;
}

export function InstructionSourcesDialog({
  instructionSources,
  instructionSourceSelection,
  onSave,
  onClose,
}: InstructionSourcesDialogProps) {
  const items = useMemo(
    () => instructionSources.map((sourceId) => ({ key: sourceId, id: sourceId, label: sourceId })),
    [instructionSources]
  );

  return (
    <ConfigSelectionDialog
      items={items}
      selection={instructionSourceSelection}
      itemNoun="instruction sources"
      onSave={onSave}
      onClose={onClose}
    />
  );
}
