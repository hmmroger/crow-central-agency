import { useCallback } from "react";
import type { AgentConfigTemplate } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { AgentEditorDialogContent } from "../../components/agent-editor/agent-editor-dialog-content.js";

/** Dialog ID prefix for agent editor modals */
const AGENT_EDITOR_DIALOG_ID = "agent-editor";

interface OpenAgentEditorOptions {
  /** Open the editor in edit mode for an existing agent */
  agentId?: string;
  /** Prefill a new-agent form with a saved template */
  templatePreset?: AgentConfigTemplate;
}

/**
 * Hook to open the agent editor as a modal dialog.
 *
 * @returns A function that opens the editor — pass agentId to edit, templatePreset to create from a template, or no arg to create from scratch.
 */
export function useOpenAgentEditor() {
  const { showDialog } = useModalDialog();

  return useCallback(
    (options: OpenAgentEditorOptions = {}) => {
      const { agentId, templatePreset } = options;
      const dialogId = agentId ? `${AGENT_EDITOR_DIALOG_ID}-${agentId}` : `${AGENT_EDITOR_DIALOG_ID}-new`;
      showDialog({
        id: dialogId,
        title: agentId ? "Edit Agent" : "Create Agent",
        component: AgentEditorDialogContent,
        componentProps: { agentId, templatePreset },
        className: "w-(--width-editor-dialog) max-w-6xl max-h-(--max-height-editor-dialog) flex flex-col",
      });
    },
    [showDialog]
  );
}
