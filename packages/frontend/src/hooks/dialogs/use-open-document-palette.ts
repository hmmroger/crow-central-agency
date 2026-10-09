import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { DocumentPaletteDialog } from "../../components/document-palette/document-palette-dialog.js";
import {
  DOCUMENT_PALETTE_DIALOG_ID,
  DOCUMENT_PALETTE_LABEL_ID,
} from "../../components/document-palette/document-palette.types.js";
import { COMMAND_PALETTE_DIALOG_CLASS_NAME } from "../../components/common/command-palette/command-palette.types.js";

export function useOpenDocumentPalette() {
  const { showDialog } = useModalDialog();

  return useCallback(() => {
    showDialog({
      id: DOCUMENT_PALETTE_DIALOG_ID,
      component: DocumentPaletteDialog,
      className: COMMAND_PALETTE_DIALOG_CLASS_NAME,
      ariaLabelledBy: DOCUMENT_PALETTE_LABEL_ID,
    });
  }, [showDialog]);
}
