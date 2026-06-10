import { useCallback } from "react";
import { AGENT_TYPE, type AgentConfigTemplate, type AgentType } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { AgentEditorDialogContent } from "../../components/agent-editor/agent-editor-dialog-content.js";

/** Dialog ID prefix for agent editor modals */
const AGENT_EDITOR_DIALOG_ID = "agent-editor";

/** Create-dialog titles per agent type. Edit mode uses a single title regardless of type. */
const CREATE_TITLE_BY_TYPE: Record<AgentType, string> = {
  [AGENT_TYPE.CLAUDE_CODE]: "Create Agent",
  [AGENT_TYPE.GITHUB_COPILOT]: "Create GitHub Copilot Agent",
};

interface OpenAgentEditorOptions {
  /** Open the editor in edit mode for an existing agent */
  agentId?: string;
  /** Prefill a new-agent form with a saved template */
  templatePreset?: AgentConfigTemplate;
  /** Provider type for a new agent — fixed at creation. Defaults to CLAUDE_CODE. Ignored when editing. */
  agentType?: AgentType;
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
      const { agentId, templatePreset, agentType = AGENT_TYPE.CLAUDE_CODE } = options;
      const dialogId = agentId ? `${AGENT_EDITOR_DIALOG_ID}-${agentId}` : `${AGENT_EDITOR_DIALOG_ID}-new`;
      showDialog({
        id: dialogId,
        title: agentId ? "Edit Agent" : CREATE_TITLE_BY_TYPE[agentType],
        component: AgentEditorDialogContent,
        componentProps: { agentId, templatePreset, agentType },
        className: "w-(--width-editor-dialog) max-w-6xl max-h-(--max-height-editor-dialog) flex flex-col",
      });
    },
    [showDialog]
  );
}
