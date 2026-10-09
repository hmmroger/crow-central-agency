import { useCallback, useEffect, useMemo } from "react";
import { useModalDialog } from "../providers/modal-dialog-provider.js";
import { AGENT_PALETTE_DIALOG_ID } from "../components/agents/agent-palette/agent-palette.types.js";
import { DOCUMENT_PALETTE_DIALOG_ID } from "../components/document-palette/document-palette.types.js";
import { useOpenAgentPalette } from "./dialogs/use-open-agent-palette.js";
import { useOpenDocumentPalette } from "./dialogs/use-open-document-palette.js";

interface PaletteHotkey {
  key: string;
  dialogId: string;
  open: () => void;
}

const AGENT_PALETTE_HOTKEY_KEY = "e";
const DOCUMENT_PALETTE_HOTKEY_KEY = "p";

/**
 * Global Ctrl/⌘+E and Ctrl/⌘+P listener for the agent and document palettes.
 * The default is suppressed even when nothing opens, so the key never reaches
 * the browser while another dialog owns the screen.
 */
export function usePaletteHotkeys() {
  const { hideDialog, openDialogIds } = useModalDialog();
  const openAgentPalette = useOpenAgentPalette();
  const openDocumentPalette = useOpenDocumentPalette();

  const palettes = useMemo<PaletteHotkey[]>(
    () => [
      { key: AGENT_PALETTE_HOTKEY_KEY, dialogId: AGENT_PALETTE_DIALOG_ID, open: openAgentPalette },
      { key: DOCUMENT_PALETTE_HOTKEY_KEY, dialogId: DOCUMENT_PALETTE_DIALOG_ID, open: openDocumentPalette },
    ],
    [openAgentPalette, openDocumentPalette]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }

      const pressedKey = event.key.toLowerCase();
      const requested = palettes.find((palette) => palette.key === pressedKey);
      if (!requested) {
        return;
      }

      event.preventDefault();

      if (event.repeat) {
        return;
      }

      const topDialogId = openDialogIds.at(-1);
      if (topDialogId === requested.dialogId) {
        hideDialog(requested.dialogId);
        return;
      }

      const openPalette = palettes.find((palette) => palette.dialogId === topDialogId);
      if (openPalette) {
        hideDialog(openPalette.dialogId);
        requested.open();
        return;
      }

      if (openDialogIds.length > 0) {
        return;
      }

      requested.open();
    },
    [palettes, hideDialog, openDialogIds]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
