import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentSessionsQuery } from "../../../hooks/queries/use-agent-sessions-query.js";
import { useAgentStateQuery } from "../../../hooks/queries/use-agent-state-query.js";
import { useSwitchSession } from "../../../hooks/queries/use-switch-session.js";
import { SessionHistoryItem } from "./session-history-item.js";

interface SessionHistoryTabProps {
  agentId: string;
}

/**
 * Sessions tab — the agent's sessions in the order the backend projected them, click to switch.
 * Switching is only offered while the agent is idle; the backend rejects it otherwise.
 */
export function SessionHistoryTab({ agentId }: SessionHistoryTabProps) {
  const { data: sessions = [], isLoading, isError } = useAgentSessionsQuery(agentId);
  const { data: agentState } = useAgentStateQuery(agentId);
  const { switchSession, error, isPending } = useSwitchSession(agentId);

  const isIdle = (agentState?.status ?? AGENT_STATUS.IDLE) === AGENT_STATUS.IDLE;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {error && (
        <div className="shrink-0 px-3 py-2 border-b border-border-subtle text-2xs text-error">{error.message}</div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-3 text-xs text-text-muted">Loading...</div>}

        {!isLoading && isError && <div className="p-3 text-xs text-error">Failed to load sessions.</div>}

        {!isLoading && !isError && sessions.length === 0 && (
          <div className="p-3 text-xs text-text-muted italic">No sessions yet</div>
        )}

        {sessions.map((node) => {
          const isCurrent = node.sessionId === agentState?.sessionId;

          return (
            <SessionHistoryItem
              key={node.sessionId}
              node={node}
              isCurrent={isCurrent}
              disabled={isCurrent || !isIdle || isPending}
              onSelect={switchSession}
            />
          );
        })}
      </div>
    </div>
  );
}
