import { useCallback, useEffect } from "react";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentStateQuery } from "../../hooks/queries/use-agent-state-query.js";
import { useAgentActions } from "../../hooks/queries/use-agent-actions.js";
import { useComposeDraft } from "../../stores/compose-draft-store.js";
import { usePendingBranch } from "../../stores/branch-anchor-store.js";
import { BranchAnchorNotice } from "./branch-anchor-notice.js";
import { MessageInput } from "./message-input.js";

interface AgentComposerProps {
  agentId: string;
  variant?: "full" | "compact";
}

export function AgentComposer({ agentId, variant = "full" }: AgentComposerProps) {
  const { draft, setDraft } = useComposeDraft(agentId);
  const { pendingBranch, clearPendingBranch } = usePendingBranch(agentId);
  const { data: agentState } = useAgentStateQuery(agentId);
  const status = agentState?.status;
  const isStreaming = status === AGENT_STATUS.STREAMING;
  const { sendMessage, injectMessage, abort } = useAgentActions(agentId);

  // Only an idle agent can be branched, so a selection made before a run started no longer applies.
  useEffect(() => {
    if (status !== undefined && status !== AGENT_STATUS.IDLE) {
      clearPendingBranch();
    }
  }, [status, clearPendingBranch]);

  // An anchor outlives its composer otherwise, and a turn run while no composer was mounted would
  // leave it pointing behind a transcript the user never saw.
  useEffect(() => clearPendingBranch, [clearPendingBranch]);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage(text, pendingBranch?.anchor);
      clearPendingBranch();
    },
    [sendMessage, pendingBranch, clearPendingBranch]
  );

  return (
    <div className="flex flex-col">
      {pendingBranch && <BranchAnchorNotice onCancel={clearPendingBranch} variant={variant} />}

      <MessageInput
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onInject={injectMessage}
        onAbort={abort}
        isStreaming={isStreaming}
        history={agentState?.inputHistory}
        variant={variant}
      />
    </div>
  );
}
