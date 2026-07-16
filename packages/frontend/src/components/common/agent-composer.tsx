import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentStateQuery } from "../../hooks/queries/use-agent-state-query.js";
import { useAgentActions } from "../../hooks/queries/use-agent-actions.js";
import { useComposeDraft } from "../../stores/compose-draft-store.js";
import { MessageInput } from "./message-input.js";

interface AgentComposerProps {
  agentId: string;
  variant?: "full" | "compact";
}

export function AgentComposer({ agentId, variant = "full" }: AgentComposerProps) {
  const { draft, setDraft } = useComposeDraft(agentId);
  const { data: agentState } = useAgentStateQuery(agentId);
  const isStreaming = agentState?.status === AGENT_STATUS.STREAMING;
  const { sendMessage, injectMessage, abort } = useAgentActions(agentId);

  return (
    <MessageInput
      value={draft}
      onChange={setDraft}
      onSend={sendMessage}
      onInject={injectMessage}
      onAbort={abort}
      isStreaming={isStreaming}
      history={agentState?.inputHistory}
      variant={variant}
    />
  );
}
