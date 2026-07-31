import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentsContext } from "../../../providers/agents-provider.js";
import { useAgentMessagesQuery } from "../../../hooks/queries/use-agent-messages-query.js";
import { useAgentStateQuery } from "../../../hooks/queries/use-agent-state-query.js";
import { useAgentStreamState } from "../../../hooks/queries/use-agent-stream-state.js";
import { useAgentActions } from "../../../hooks/queries/use-agent-actions.js";
import { MessageList } from "./message-list.js";
import { AgentComposer } from "../../common/agent-composer.js";
import { PermissionQueue } from "./permission-queue.js";
import { AskUserQuestionPanel } from "./ask-user-question-panel.js";

interface AgentConsoleProps {
  agentId: string;
}

/**
 * Agent console - message list + input + permission queue.
 * Composes query hooks for data, stream state for ephemeral WS state, and actions for commands.
 * Status, session actions, and artifacts are handled by the side panel.
 */
export function AgentConsole({ agentId }: AgentConsoleProps) {
  const { isLoading, getAgent } = useAgentsContext();
  const agent = getAgent(agentId);
  const { data: messages = [] } = useAgentMessagesQuery(agentId);
  const { data: agentState } = useAgentStateQuery(agentId);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const { streamingText, activeToolUse } = useAgentStreamState(agentId);
  const pendingPermissions = agentState?.pendingPermissions ?? [];
  const pendingQuestion = agentState?.pendingQuestion;
  const { allowPermission, allowAlwaysPermission, denyPermission, submitQuestionAnswers, dismissQuestion } =
    useAgentActions(agentId);
  const isStreaming = status === AGENT_STATUS.STREAMING;

  if (isLoading || !agent) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        {isLoading ? "Loading..." : "Agent not found"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Main console area */}
      <div className="flex flex-col flex-1 min-h-0">
        <MessageList
          agentId={agent.id}
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          activeToolUse={activeToolUse}
        />

        <div className="max-w-3xl mx-auto px-5 shrink-0 max-h-console-interrupt overflow-y-auto">
          <PermissionQueue
            permissions={pendingPermissions}
            onAllow={allowPermission}
            onAllowAlways={allowAlwaysPermission}
            onDeny={denyPermission}
          />

          {pendingQuestion && (
            <div className="py-2">
              <AskUserQuestionPanel
                key={pendingQuestion.toolUseId}
                toolUseId={pendingQuestion.toolUseId}
                questions={pendingQuestion.questions}
                onSubmit={submitQuestionAnswers}
                onRespond={dismissQuestion}
              />
            </div>
          )}
        </div>

        <AgentComposer agentId={agent.id} variant="full" />
      </div>
    </div>
  );
}
