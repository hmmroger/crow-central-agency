import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, Minimize2, Plus } from "lucide-react";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { useAgentMessagesQuery } from "../../hooks/use-agent-messages-query.js";
import { useAgentStateQuery, DEFAULT_SESSION_USAGE } from "../../hooks/use-agent-state-query.js";
import { useAgentStreamState } from "../../hooks/use-agent-stream-state.js";
import { useAgentActions } from "../../hooks/use-agent-actions.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ActionBar, ActionBarButton } from "../layout/action-bar.js";
import { MessageList } from "./message-list.js";
import { MessageInput } from "../common/message-input.js";
import { PermissionQueue } from "./permission-queue.js";
import { ArtifactPanel } from "./artifact-panel.js";
import { STATUS_DOT_COLOR, STATUS_LABEL } from "../../utils/agent-status-display.js";

interface AgentConsoleProps {
  agentId: string;
}

/**
 * Full agent console view — action bar + message list + input + artifact sidebar.
 * Composes query hooks for data, stream state for ephemeral WS state, and actions for commands.
 */
export function AgentConsole({ agentId }: AgentConsoleProps) {
  const { data: agents = [], isLoading } = useAgentsQuery();
  const agent = agents.find((item) => item.id === agentId);
  const { data: messages = [] } = useAgentMessagesQuery(agentId);
  const { data: agentState } = useAgentStateQuery(agentId);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const usage = agentState?.sessionUsage ?? DEFAULT_SESSION_USAGE;
  const { streamingText, activeToolUse, pendingPermissions, removePendingPermission, resetStreamState } =
    useAgentStreamState(agentId);
  const { sendMessage, injectMessage, abort, newConversation, compact, allowPermission, denyPermission } =
    useAgentActions(agentId, { removePendingPermission, resetStreamState });
  const isStreaming = status === AGENT_STATUS.STREAMING;
  const [showArtifacts, setShowArtifacts] = useState(false);

  const toggleArtifacts = useCallback(() => setShowArtifacts((prev) => !prev), []);

  if (isLoading || !agent) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        {isLoading ? "Loading..." : "Agent not found"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <HeaderPortal title={agent.name} />

      {/* Action bar — status (left) + actions (right) */}
      <ActionBar
        left={
          <>
            <span className="inline-flex items-center gap-1">
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLOR[status]} ${status === AGENT_STATUS.STREAMING ? "animate-pulse" : ""}`}
              />
              {STATUS_LABEL[status]}
            </span>
            <span className="font-mono">{agent.model}</span>
            {usage.totalCostUsd > 0 && <span>${usage.totalCostUsd.toFixed(4)}</span>}
            {usage.contextTotal > 0 && (
              <span>
                {Math.round(usage.contextUsed / 1000)}k / {Math.round(usage.contextTotal / 1000)}k
              </span>
            )}
          </>
        }
        right={
          <>
            <ActionBarButton icon={Minimize2} label="Compact" onClick={compact} disabled={isStreaming} />
            <ActionBarButton icon={Plus} label="New" onClick={newConversation} />
            <ActionBarButton icon={FolderOpen} label="Artifacts" onClick={toggleArtifacts} />
          </>
        }
      />

      {/* Main console area */}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0">
          <MessageList
            messages={messages}
            streamingText={streamingText}
            isStreaming={isStreaming}
            activeToolUse={activeToolUse}
          />

          <div className="max-w-3xl mx-auto px-5 shrink-0">
            <PermissionQueue permissions={pendingPermissions} onAllow={allowPermission} onDeny={denyPermission} />
          </div>

          <MessageInput onSend={sendMessage} onInject={injectMessage} onAbort={abort} isStreaming={isStreaming} />
        </div>

        {/* Artifact sidebar */}
        <AnimatePresence>
          {showArtifacts && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "18rem", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="shrink-0 overflow-hidden"
            >
              <div className="w-72">
                <ArtifactPanel agentId={agent.id} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
