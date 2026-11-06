import { useCallback, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useSessionForkPointsQuery } from "../../../hooks/queries/use-session-fork-points-query.js";
import { useFullPanel } from "../../../hooks/use-full-panel.js";
import { useAppStore } from "../../../stores/app-store.js";
import { cn } from "../../../utils/cn.js";
import { Tree } from "../../common/tree/tree.js";
import { toSessionForkTreeNodes } from "./session-fork-tree-nodes.js";
import { SESSION_FORK_NODE_TYPE, type SessionForkNodeData } from "./session-forks.types.js";

interface SessionForksProps {
  agentId: string;
  /** The agent's current session */
  sessionId?: string;
  /** Whether fork rows refuse to switch */
  disabled: boolean;
  onSelectFork: (sessionId: string) => void;
}

/** Collapsible tree of the current session's forks under the messages they forked from. */
export function SessionForks({ agentId, sessionId, disabled, onSelectFork }: SessionForksProps) {
  const { data, isLoading, isError } = useSessionForkPointsQuery(agentId, sessionId);
  const isCollapsed = useAppStore((state) => state.isSessionForksCollapsed);
  const toggleCollapsed = useAppStore((state) => state.toggleSessionForksCollapsed);
  const requestMessageJump = useAppStore((state) => state.requestMessageJump);
  const { hide: hideFullPanel } = useFullPanel();

  const handleSelect = useCallback(
    (_id: string, nodeData?: SessionForkNodeData) => {
      if (nodeData?.type === SESSION_FORK_NODE_TYPE.FORK) {
        onSelectFork(nodeData.sessionId);
      } else if (nodeData?.type === SESSION_FORK_NODE_TYPE.FORK_POINT) {
        requestMessageJump(agentId, nodeData.messageId);
        hideFullPanel();
      }
    },
    [agentId, onSelectFork, requestMessageJump, hideFullPanel]
  );

  const nodes = useMemo(() => (data ? toSessionForkTreeNodes(data, disabled) : []), [data, disabled]);
  const forkCount = nodes.reduce((count, node) => count + node.children.length, 0);

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

          {forkCount > 0 && <Tree key={sessionId} nodes={nodes} onSelect={handleSelect} ariaLabel="Forks" />}
        </div>
      )}
    </section>
  );
}
