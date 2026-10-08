import { useCallback, useEffect, useMemo } from "react";
import { useModalDialog } from "../providers/modal-dialog-provider.js";
import { AGENT_PALETTE_DIALOG_ID } from "../components/agents/agent-palette/agent-palette.types.js";
import { NOTE_PALETTE_DIALOG_ID } from "../components/notes/note-palette/note-palette.types.js";
import { useOpenAgentPalette } from "./dialogs/use-open-agent-palette.js";
import { useOpenNotePalette } from "./dialogs/use-open-note-palette.js";

interface PaletteHotkey {
  key: string;
  dialogId: string;
  open: () => void;
}

const AGENT_PALETTE_HOTKEY_KEY = "e";
const NOTE_PALETTE_HOTKEY_KEY = "p";

/**
 * Global Ctrl/⌘+E and Ctrl/⌘+P listener for the agent and note palettes.
 * The default is suppressed even when nothing opens, so the key never reaches
 * the browser while another dialog owns the screen.
 */
export function usePaletteHotkeys() {
  const { hideDialog, openDialogIds } = useModalDialog();
  const openAgentPalette = useOpenAgentPalette();
  const openNotePalette = useOpenNotePalette();

  const palettes = useMemo<PaletteHotkey[]>(
    () => [
      { key: AGENT_PALETTE_HOTKEY_KEY, dialogId: AGENT_PALETTE_DIALOG_ID, open: openAgentPalette },
      { key: NOTE_PALETTE_HOTKEY_KEY, dialogId: NOTE_PALETTE_DIALOG_ID, open: openNotePalette },
    ],
    [openAgentPalette, openNotePalette]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      const requested = palettes.find((palette) => palette.key === event.key);
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
