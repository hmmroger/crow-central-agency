import { useCallback, useState } from "react";
import { ChevronDown, Minimize2, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { cn } from "../../utils/cn.js";
import { useAppStore } from "../../stores/app-store.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { useAgentStateQuery, DEFAULT_SESSION_USAGE } from "../../hooks/use-agent-state-query.js";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import { ArtifactPanel } from "../console/artifact-panel.js";
import { STATUS_DOT_COLOR, STATUS_TEXT_COLOR, STATUS_LABEL } from "../../utils/agent-status-display.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Side panel content for the Agents view.
 * Flight-deck instrument readout: recessed gauge wells, monospace data,
 * status-colored glow, dense utilitarian layout.
 */
export function AgentsViewSidePanel() {
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);

  if (!selectedAgentId) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-3xs font-mono uppercase tracking-widest">
        No signal
      </div>
    );
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
  const { data: agents = [] } = useAgentsQuery();
  const agent = agents.find((item) => item.id === agentId);
  const { data: agentState } = useAgentStateQuery(agentId);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const usage = agentState?.sessionUsage ?? DEFAULT_SESSION_USAGE;
  const isStreaming = status === AGENT_STATUS.STREAMING;

  const [showArtifacts, setShowArtifacts] = useState(false);
  const toggleArtifacts = useCallback(() => setShowArtifacts((prev) => !prev), []);

  const compactMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<void>(`/agents/${agentId}/session/compact`);

      return unwrapResponse(response);
    },
    onError: (error) => {
      console.error(`[compact] failed for agent ${agentId}:`, error.message);
    },
  });

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
    <div className="flex flex-col h-full px-3 pb-3 gap-4 animate-[fade-in_var(--duration-normal)_var(--ease-out)_both]">
      {/* ── Agent callsign ── */}
      {agent && (
        <div className="space-y-1">
          <h3 className="font-mono text-xs font-semibold text-primary truncate tracking-wide">{agent.name}</h3>
          {agent.description && (
            <p className="text-3xs text-text-muted leading-relaxed line-clamp-2">{agent.description}</p>
          )}
        </div>
      )}

      {/* ── Status readout — recessed gauge ── */}
      <div className="rounded-md bg-surface-inset border border-border-subtle/30 px-3 py-2.5">
        <GaugeLabel>Status</GaugeLabel>
        <div className="flex items-center gap-2.5 mt-1.5">
          {/* Status beacon with glow ring */}
          <span className="relative flex items-center justify-center">
            <span className={cn("w-2 h-2 rounded-full", STATUS_DOT_COLOR[status], isStreaming && "animate-pulse")} />
            <span className={cn("absolute inset-0 rounded-full opacity-40 blur-[3px]", STATUS_DOT_COLOR[status])} />
          </span>
          <span className={cn("font-mono text-2xs font-medium tracking-wide", STATUS_TEXT_COLOR[status])}>
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      {/* ── Session metrics — instrument wells ── */}
      {(usage.totalCostUsd > 0 || usage.contextTotal > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {usage.totalCostUsd > 0 && <MetricWell label="Cost" value={`$${usage.totalCostUsd.toFixed(4)}`} />}
          {usage.contextTotal > 0 && (
            <MetricWell
              label="Context"
              value={`${Math.round(usage.contextUsed / 1000)}k`}
              suffix={`/ ${Math.round(usage.contextTotal / 1000)}k`}
            />
          )}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="space-y-1.5">
        <GaugeLabel>Controls</GaugeLabel>
        <div className="flex gap-1.5">
          <ControlButton icon={Minimize2} label="Compact" onClick={compact} disabled={isStreaming} />
          <ControlButton icon={Plus} label="New" onClick={newConversation} />
        </div>
      </div>

      {/* ── Artifacts — collapsible ── */}
      <div className="flex flex-col flex-1 min-h-0">
        <button type="button" className="flex items-center justify-between w-full group" onClick={toggleArtifacts}>
          <GaugeLabel>Artifacts</GaugeLabel>
          <ChevronDown
            className={cn(
              "h-3 w-3 text-text-muted/30 group-hover:text-text-muted transition-all",
              showArtifacts && "rotate-180"
            )}
          />
        </button>
        {showArtifacts && (
          <div className="flex-1 min-h-0 mt-1.5 rounded-md bg-surface-inset border border-border-subtle/30 overflow-hidden">
            <ArtifactPanel agentId={agentId} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ── */

/** Gauge section label — tiny uppercase monospace, like instrument etching */
function GaugeLabel({ children }: { children: string }) {
  return <span className="text-3xs font-mono uppercase tracking-[0.15em] text-text-muted/50">{children}</span>;
}

interface MetricWellProps {
  label: string;
  value: string;
  suffix?: string;
}

/**
 * Recessed metric display — inset background with monospace readout.
 * Resembles a cockpit instrument gauge well.
 */
function MetricWell({ label, value, suffix }: MetricWellProps) {
  return (
    <div className="rounded-md bg-surface-inset border border-border-subtle/30 px-3 py-2">
      <GaugeLabel>{label}</GaugeLabel>
      <div className="mt-1">
        <span className="font-mono text-xs text-text-primary">{value}</span>
        {suffix && <span className="font-mono text-3xs text-text-muted ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

interface ControlButtonProps {
  icon: typeof Minimize2;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Control button — bordered pill matching the command strip aesthetic.
 * Inset feel with subtle border, teal hover glow.
 */
function ControlButton({ icon: Icon, label, onClick, disabled }: ControlButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md",
        "font-mono text-3xs uppercase tracking-wider",
        "text-text-muted border border-border-subtle/40 bg-surface-inset/50",
        "hover:text-primary hover:border-primary/30 hover:bg-primary/5",
        "active:bg-primary/10",
        "transition-colors",
        "disabled:opacity-25 disabled:pointer-events-none"
      )}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
