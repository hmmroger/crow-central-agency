import { ChevronRight } from "lucide-react";
import { useSessionForkPointsQuery } from "../../../hooks/queries/use-session-fork-points-query.js";
import { useAppStore } from "../../../stores/app-store.js";
import { cn } from "../../../utils/cn.js";
import { SessionForkGroup } from "./session-fork-group.js";

interface SessionForksProps {
  agentId: string;
  /** The agent's current session */
  sessionId?: string;
  /** Whether fork rows refuse to switch */
  disabled: boolean;
  onSelectFork: (sessionId: string) => void;
}

/** Collapsible list of the current session's forks, grouped by the message they forked from. */
export function SessionForks({ agentId, sessionId, disabled, onSelectFork }: SessionForksProps) {
  const { data, isLoading, isError } = useSessionForkPointsQuery(agentId, sessionId);
  const isCollapsed = useAppStore((state) => state.isSessionForksCollapsed);
  const toggleCollapsed = useAppStore((state) => state.toggleSessionForksCollapsed);

  const forkPoints = data?.forkPoints ?? [];
  const unavailableForks = data?.unavailableForks ?? [];
  const forkCount = forkPoints.reduce((count, forkPoint) => count + forkPoint.forks.length, unavailableForks.length);

  return (
    <section className={cn("flex shrink-0 flex-col gap-1 border-t border-border-subtle pt-1", !isCollapsed && "h-1/3")}>
      <button
        type="button"
        className="group flex shrink-0 items-center gap-2 px-2 py-1 text-left"
        onClick={toggleCollapsed}
        aria-expanded={!isCollapsed}
      >
        <ChevronRight
          className={cn("h-3 w-3 text-text-muted transition-transform duration-150", !isCollapsed && "rotate-90")}
        />
        <span className="text-2xs font-medium uppercase tracking-widest text-text-muted transition-colors group-hover:text-text-neutral">
          Forks
        </span>
        <span className="text-2xs text-text-muted">{forkCount}</span>
      </button>

      {!isCollapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading && <div className="p-3 text-xs text-text-muted">Loading...</div>}

          {!isLoading && isError && <div className="p-3 text-xs text-error">Failed to load forks.</div>}

          {!isLoading && !isError && forkCount === 0 && (
            <div className="p-3 text-xs text-text-muted italic">No forks from this session</div>
          )}

          {unavailableForks.length > 0 && (
            <SessionForkGroup
              title="Message no longer available"
              forks={unavailableForks}
              disabled={disabled}
              onSelect={onSelectFork}
            />
          )}

          {forkPoints.map((forkPoint) => (
            <SessionForkGroup
              key={forkPoint.messageId}
              title={forkPoint.excerpt}
              forks={forkPoint.forks}
              disabled={disabled}
              onSelect={onSelectFork}
            />
          ))}
        </div>
      )}
    </section>
  );
}
