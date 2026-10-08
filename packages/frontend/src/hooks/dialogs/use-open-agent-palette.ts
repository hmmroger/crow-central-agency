import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { AgentPaletteDialog } from "../../components/agents/agent-palette/agent-palette-dialog.js";
import {
  AGENT_PALETTE_DIALOG_ID,
  AGENT_PALETTE_LABEL_ID,
} from "../../components/agents/agent-palette/agent-palette.types.js";
import { COMMAND_PALETTE_DIALOG_CLASS_NAME } from "../../components/common/command-palette/command-palette.types.js";

export function useOpenAgentPalette() {
  const { showDialog } = useModalDialog();

  return useCallback(() => {
    showDialog({
      id: AGENT_PALETTE_DIALOG_ID,
      component: AgentPaletteDialog,
      className: COMMAND_PALETTE_DIALOG_CLASS_NAME,
      ariaLabelledBy: AGENT_PALETTE_LABEL_ID,
    });
  }, [showDialog]);
}
