import type { ComponentType } from "react";
import { useCallback } from "react";
import { Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { cn } from "../../../utils/cn.js";
import { useAgentStateQuery, DEFAULT_SESSION_USAGE } from "../../../hooks/queries/use-agent-state-query.js";
import { apiClient, unwrapResponse } from "../../../services/api-client.js";
import { agentKeys } from "../../../services/query-keys.js";
import { STATUS_DOT_COLOR, STATUS_TEXT_COLOR, STATUS_LABEL } from "../../../utils/agent-status-display.js";
import { ActivityFeed } from "../activity/activity-feed.js";
import type { ApiError } from "../../../services/api-client.types.js";

interface StatusTabProps {
  agentId: string;
}

interface MetricWellProps {
  label: string;
  value: string;
  suffix?: string;
}

interface ControlButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Status tab — live agent status, session usage metrics, controls,
 * and the recent activity feed.
 */
export function StatusTab({ agentId }: StatusTabProps) {
  const queryClient = useQueryClient();
  const { data: agentState } = useAgentStateQuery(agentId);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const usage = agentState?.sessionUsage ?? DEFAULT_SESSION_USAGE;
  const isStreaming = status === AGENT_STATUS.STREAMING;

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

  const newConversation = useCallback(() => newConversationMutation.mutate(), [newConversationMutation]);

  return (
    <div className="flex-1 min-h-0 px-3 pt-2 pb-3 gap-4 flex flex-col">
      <div className="shrink-0 rounded-md bg-surface-inset border border-border-subtle/30 px-3 py-2.5">
        <GaugeLabel>Status</GaugeLabel>
        <div className="flex items-center gap-2.5 mt-1.5">
          <span className="relative flex items-center justify-center">
            <span className={cn("w-2 h-2 rounded-full", STATUS_DOT_COLOR[status], isStreaming && "animate-pulse")} />
            <span className={cn("absolute inset-0 rounded-full opacity-40 blur-sm", STATUS_DOT_COLOR[status])} />
          </span>
          <span className={cn("font-mono text-2xs font-medium tracking-wide", STATUS_TEXT_COLOR[status])}>
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      <div className="shrink-0 grid grid-cols-2 gap-2">
        <MetricWell label="Cost" value={`$${usage.totalCostUsd.toFixed(4)}`} />
        <MetricWell
          label="Tokens (input/output)"
          value={`${Math.round(usage.inputTokens / 1000)}k`}
          suffix={`/ ${Math.round(usage.outputTokens / 1000)}k`}
        />
      </div>

      <div className="shrink-0 space-y-1.5">
        <GaugeLabel>Controls</GaugeLabel>
        <div className="flex gap-1.5">
          <ControlButton icon={Plus} label="New" onClick={newConversation} />
        </div>
      </div>

      <ActivityFeed agentId={agentId} />
    </div>
  );
}

/** Gauge section label - tiny uppercase monospace, like instrument etching */
function GaugeLabel({ children }: { children: string }) {
  return <span className="text-2xs font-mono uppercase tracking-[0.15em] text-text-muted">{children}</span>;
}

/**
 * Recessed metric display - inset background with monospace readout.
 * Resembles a cockpit instrument gauge well.
 */
function MetricWell({ label, value, suffix }: MetricWellProps) {
  return (
    <div className="rounded-md bg-surface-inset border border-border-subtle/30 px-3 py-2">
      <GaugeLabel>{label}</GaugeLabel>
      <div className="mt-1">
        <span className="font-mono text-xs text-text-base">{value}</span>
        {suffix && <span className="font-mono text-2xs text-text-muted ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

/**
 * Control button - bordered pill matching the command strip aesthetic.
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
