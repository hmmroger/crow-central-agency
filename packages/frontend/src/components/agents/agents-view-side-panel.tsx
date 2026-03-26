import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, Minimize2, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { cn } from "../../utils/cn.js";
import { useAppStore } from "../../stores/app-store.js";
import { useAgentStateQuery, DEFAULT_SESSION_USAGE } from "../../hooks/use-agent-state-query.js";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import { ActionBarButton } from "../common/action-bar-button.js";
import { ArtifactPanel } from "../console/artifact-panel.js";
import { STATUS_DOT_COLOR, STATUS_LABEL } from "../../utils/agent-status-display.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Side panel content for the Agents view.
 * Shows agent status, usage metrics, session actions, and artifact browser.
 */
export function AgentsViewSidePanel() {
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);

  if (!selectedAgentId) {
    return <div className="flex items-center justify-center h-full text-text-muted text-xs">Select an agent</div>;
  }

  return <AgentSidePanelContent agentId={selectedAgentId} />;
}

interface AgentSidePanelContentProps {
  agentId: string;
}

/**
 * Inner content — separated so hooks are only called when an agent is selected.
 */
function AgentSidePanelContent({ agentId }: AgentSidePanelContentProps) {
  const queryClient = useQueryClient();
  const { data: agentState } = useAgentStateQuery(agentId);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const usage = agentState?.sessionUsage ?? DEFAULT_SESSION_USAGE;
  const isStreaming = status === AGENT_STATUS.STREAMING;

  const [showArtifacts, setShowArtifacts] = useState(false);
  const toggleArtifacts = useCallback(() => setShowArtifacts((prev) => !prev), []);

  /** Trigger manual compaction */
  const compactMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<void>(`/agents/${agentId}/session/compact`);

      return unwrapResponse(response);
    },
    onError: (error) => {
      console.error(`[compact] failed for agent ${agentId}:`, error.message);
    },
  });

  /** Start a new conversation */
  const newConversationMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<void>(`/agents/${agentId}/session/new`);

      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
    },
    onError: (error) => {
      console.error(`[newConversation] failed for agent ${agentId}:`, error.message);
    },
  });

  const compact = useCallback(() => compactMutation.mutate(), [compactMutation]);
  const newConversation = useCallback(() => newConversationMutation.mutate(), [newConversationMutation]);

  return (
    <div className="flex flex-col h-full px-3">
      {/* Status + usage metrics */}
      <div className="flex flex-col gap-2 text-xs text-text-muted pb-3 border-b border-border-subtle/30">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "shrink-0 w-1.5 h-1.5 rounded-full",
              STATUS_DOT_COLOR[status],
              status === AGENT_STATUS.STREAMING && "animate-pulse"
            )}
          />
          {STATUS_LABEL[status]}
        </span>
        {usage.totalCostUsd > 0 && <span>${usage.totalCostUsd.toFixed(4)}</span>}
        {usage.contextTotal > 0 && (
          <span>
            {Math.round(usage.contextUsed / 1000)}k / {Math.round(usage.contextTotal / 1000)}k
          </span>
        )}
      </div>

      {/* Session actions */}
      <div className="flex flex-col gap-1 py-3 border-b border-border-subtle/30">
        <ActionBarButton icon={Minimize2} label="Compact" onClick={compact} disabled={isStreaming} />
        <ActionBarButton icon={Plus} label="New" onClick={newConversation} />
        <ActionBarButton icon={FolderOpen} label="Artifacts" onClick={toggleArtifacts} />
      </div>

      {/* Artifact panel */}
      <AnimatePresence>
        {showArtifacts && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="overflow-hidden flex-1 min-h-0"
          >
            <ArtifactPanel agentId={agentId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
