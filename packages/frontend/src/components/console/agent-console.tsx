import { useCallback, useMemo, useState } from "react";
import { FolderOpen, Minimize2, Plus } from "lucide-react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { useAgentInteraction } from "../../hooks/use-agent-interaction.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ConsoleStatusBar } from "./console-status-bar.js";
import { MessageList } from "./message-list.js";
import { MessageInput } from "./message-input.js";
import { PermissionQueue } from "./permission-queue.js";
import { ArtifactPanel } from "./artifact-panel.js";

interface AgentConsoleProps {
  agent: AgentConfig;
}

/**
 * Full agent console view — status bar + message list + input + artifact sidebar.
 * Registers navigation title and actions in the app header via HeaderPortal.
 */
export function AgentConsole({ agent }: AgentConsoleProps) {
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
  } = useAgentInteraction(agent.id);

  const toggleArtifacts = useCallback(() => setShowArtifacts((prev) => !prev), []);

  const headerActions = useMemo(
    () => [
      { key: "compact", label: "Compact", icon: Minimize2, onClick: compact, disabled: isStreaming },
      { key: "new", label: "New", icon: Plus, onClick: newConversation },
      { key: "artifacts", label: "Artifacts", icon: FolderOpen, onClick: toggleArtifacts },
    ],
    [compact, isStreaming, newConversation, toggleArtifacts]
  );

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
      {showArtifacts && (
        <div className="w-72 shrink-0">
          <ArtifactPanel agentId={agent.id} />
        </div>
      )}
    </div>
  );
}
