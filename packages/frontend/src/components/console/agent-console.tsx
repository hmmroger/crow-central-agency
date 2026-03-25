import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, Minimize2, Plus } from "lucide-react";
import { useAgentInteraction } from "../../hooks/use-agent-interaction.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ConsoleStatusBar } from "./console-status-bar.js";
import { MessageList } from "./message-list.js";
import { MessageInput } from "../common/message-input.js";
import { PermissionQueue } from "./permission-queue.js";
import { ArtifactPanel } from "./artifact-panel.js";

interface AgentConsoleProps {
  agentId: string;
}

/**
 * Full agent console view — status bar + message list + input + artifact sidebar.
 * Owns its agent data via useAgentsQuery. Registers navigation title and actions via HeaderPortal.
 */
export function AgentConsole({ agentId }: AgentConsoleProps) {
  const { data: agents = [], isLoading } = useAgentsQuery();
  const agent = agents.find((item) => item.id === agentId);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const {
    messages,
    streamingText,
    isStreaming,
    status,
    usage,
    pendingPermissions,
    activeToolUse,
    sendMessage,
    injectMessage,
    abort,
    newConversation,
    compact,
    allowPermission,
    denyPermission,
  } = useAgentInteraction(agentId);

  const toggleArtifacts = useCallback(() => setShowArtifacts((prev) => !prev), []);

  const headerActions = useMemo(
    () => [
      { key: "compact", label: "Compact", icon: Minimize2, onClick: compact, disabled: isStreaming },
      { key: "new", label: "New", icon: Plus, onClick: newConversation },
      { key: "artifacts", label: "Artifacts", icon: FolderOpen, onClick: toggleArtifacts },
    ],
    [compact, isStreaming, newConversation, toggleArtifacts]
  );

  if (isLoading || !agent) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        {isLoading ? "Loading..." : "Agent not found"}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <HeaderPortal title={agent.name} actions={headerActions} />

      {/* Main console area */}
      <div className="flex flex-col flex-1 min-w-0">
        <ConsoleStatusBar agent={agent} status={status} usage={usage} />

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
  );
}
