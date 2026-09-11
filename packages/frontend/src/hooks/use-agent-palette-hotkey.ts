import { useCallback, useEffect } from "react";
import { useModalDialog } from "../providers/modal-dialog-provider.js";
import { AGENT_PALETTE_DIALOG_ID } from "../components/agents/agent-palette/agent-palette.types.js";
import { useOpenAgentPalette } from "./dialogs/use-open-agent-palette.js";

const AGENT_PALETTE_HOTKEY_KEY = "e";

/**
 * Global Ctrl/⌘+E listener toggling the agent palette.
 * The default is suppressed even when the palette declines to open, so the key never
 * reaches the browser omnibox while another dialog owns the screen.
 */
export function useAgentPaletteHotkey() {
  const { hideDialog, isDialogOpen, openDialogIds } = useModalDialog();
  const openAgentPalette = useOpenAgentPalette();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isHotkey = (event.ctrlKey || event.metaKey) && !event.altKey && event.key === AGENT_PALETTE_HOTKEY_KEY;
      if (!isHotkey) {
        return;
      }

      event.preventDefault();

      if (event.repeat) {
        return;
      }

      if (isDialogOpen(AGENT_PALETTE_DIALOG_ID)) {
        hideDialog(AGENT_PALETTE_DIALOG_ID);
        return;
      }

      if (openDialogIds.length > 0) {
        return;
      }

      openAgentPalette();
    },
    [isDialogOpen, hideDialog, openDialogIds, openAgentPalette]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
