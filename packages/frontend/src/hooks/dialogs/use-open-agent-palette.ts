import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { AgentPaletteDialog } from "../../components/agents/agent-palette/agent-palette-dialog.js";
import {
  AGENT_PALETTE_DIALOG_ID,
  AGENT_PALETTE_LABEL_ID,
} from "../../components/agents/agent-palette/agent-palette.types.js";

export function useOpenAgentPalette() {
  const { showDialog } = useModalDialog();

  return useCallback(() => {
    showDialog({
      id: AGENT_PALETTE_DIALOG_ID,
      component: AgentPaletteDialog,
      className: "w-[95vw] md:w-lg",
      ariaLabelledBy: AGENT_PALETTE_LABEL_ID,
    });
  }, [showDialog]);
}
