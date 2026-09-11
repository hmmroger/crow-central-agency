import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentState } from "../../../hooks/use-agent-state.js";
import { getAgentAbbreviation } from "../../../utils/agent-abbreviation.js";
import { STATUS_DOT_COLOR, STATUS_LABEL } from "../../../utils/agent-status-display.js";
import { cn } from "../../../utils/cn.js";
import type { AgentPaletteEntry } from "./agent-palette.types.js";

interface AgentPaletteRowProps {
  entry: AgentPaletteEntry;
  index: number;
  /** Referenced by the search input's aria-activedescendant when active */
  rowId: string;
  isActive: boolean;
  onActivate: (index: number) => void;
  onHover: (index: number) => void;
}

/**
 * One palette option. Never focusable: focus belongs to the search input, so
 * the row suppresses the focus shift a mousedown would otherwise cause.
 */
export function AgentPaletteRow({ entry, index, rowId, isActive, onActivate, onHover }: AgentPaletteRowProps) {
  const { agent, isCurrent } = entry;
  const rowRef = useRef<HTMLDivElement>(null);
  const agentState = useAgentState(agent.id);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;

  useEffect(() => {
    if (!isActive) {
      return;
    }

    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  const handleMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleClick = useCallback(() => onActivate(index), [onActivate, index]);

  const handleMouseEnter = useCallback(() => onHover(index), [onHover, index]);

  return (
    <div
      ref={rowRef}
      id={rowId}
      role="option"
      aria-selected={isActive}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
        isActive ? "bg-surface-accent ring-1 ring-border-focus" : "hover:bg-surface-elevated"
      )}
    >
      <span
        aria-hidden="true"
        className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xs border border-border-subtle font-mono text-3xs text-text-muted"
      >
        {getAgentAbbreviation(agent.name)}
      </span>

      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-medium truncate text-text-base">{agent.name}</span>
        {agent.description && <span className="text-xs text-text-muted truncate">{agent.description}</span>}
      </span>

      {status !== AGENT_STATUS.IDLE && (
        <span
          className={cn("shrink-0 w-2 h-2 rounded-full", STATUS_DOT_COLOR[status])}
          title={STATUS_LABEL[status]}
          aria-label={STATUS_LABEL[status]}
        />
      )}

      {isCurrent && (
        <span className="shrink-0 px-1.5 py-0.5 rounded-xs bg-surface-inset text-3xs uppercase tracking-wider text-text-muted">
          Current
        </span>
      )}
    </div>
  );
}
