import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { NotePaletteDialog } from "../../components/notes/note-palette/note-palette-dialog.js";
import {
  NOTE_PALETTE_DIALOG_ID,
  NOTE_PALETTE_LABEL_ID,
} from "../../components/notes/note-palette/note-palette.types.js";
import { COMMAND_PALETTE_DIALOG_CLASS_NAME } from "../../components/common/command-palette/command-palette.types.js";

export function useOpenNotePalette() {
  const { showDialog } = useModalDialog();

  return useCallback(() => {
    showDialog({
      id: NOTE_PALETTE_DIALOG_ID,
      component: NotePaletteDialog,
      className: COMMAND_PALETTE_DIALOG_CLASS_NAME,
      ariaLabelledBy: NOTE_PALETTE_LABEL_ID,
    });
  }, [showDialog]);
}
