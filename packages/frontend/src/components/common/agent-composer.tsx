import { useCallback, useEffect } from "react";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentStateQuery } from "../../hooks/queries/use-agent-state-query.js";
import { useAgentActions } from "../../hooks/queries/use-agent-actions.js";
import { useComposeDraft, usePendingBranchAnchor } from "../../stores/compose-draft-store.js";
import { BranchAnchorNotice } from "./branch-anchor-notice.js";
import { MessageInput } from "./message-input.js";

interface AgentComposerProps {
  agentId: string;
  variant?: "full" | "compact";
}

export function AgentComposer({ agentId, variant = "full" }: AgentComposerProps) {
  const { draft, setDraft } = useComposeDraft(agentId);
  const { pendingBranchAnchorId, clearPendingBranchAnchorId } = usePendingBranchAnchor(agentId);
  const { data: agentState } = useAgentStateQuery(agentId);
  const status = agentState?.status;
  const sessionId = agentState?.sessionId;
  const isStreaming = status === AGENT_STATUS.STREAMING;
  const { sendMessage, injectMessage, abort } = useAgentActions(agentId);

  // Only an idle agent can be branched, so a selection made before a run started no longer applies.
  useEffect(() => {
    if (status !== undefined && status !== AGENT_STATUS.IDLE) {
      clearPendingBranchAnchorId();
    }
  }, [status, clearPendingBranchAnchorId]);

  const handleSend = useCallback(
    (text: string) => {
      const branchPoint =
        pendingBranchAnchorId !== undefined && sessionId !== undefined
          ? { sessionId, fromMessageId: pendingBranchAnchorId }
          : undefined;

      sendMessage(text, branchPoint);
      clearPendingBranchAnchorId();
    },
    [sendMessage, pendingBranchAnchorId, sessionId, clearPendingBranchAnchorId]
  );

  return (
    <div className="flex flex-col">
      {pendingBranchAnchorId !== undefined && (
        <BranchAnchorNotice onCancel={clearPendingBranchAnchorId} variant={variant} />
      )}

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
