import { useContext } from "react";
import { ChevronDown, GripVertical, Maximize2, Pin, PinOff, Settings } from "lucide-react";
import { AGENT_STATUS, type AgentConfig, type AgentStatus } from "@crow-central-agency/shared";
import { useAppStore } from "../../../stores/app-store.js";
import { useOpenAgentEditor } from "../../../hooks/dialogs/use-open-agent-editor.js";
import { useUpdateAgent } from "../../../hooks/queries/use-agent-mutations.js";
import { STATUS_DOT_COLOR, STATUS_TEXT_COLOR, STATUS_LABEL } from "../../../utils/agent-status-display.js";
import { AgentDragHandleContext } from "../context/agent-drag-handle-context.js";

interface AgentCardHeaderProps {
  agent: AgentConfig;
  status: AgentStatus;
  expanded: boolean;
  onToggleExpand: () => void;
}

/**
 * Agent card header - name (click to toggle expand/collapse), status indicator, actions.
 */
export function AgentCardHeader({ agent, status, expanded, onToggleExpand }: AgentCardHeaderProps) {
  const openAgentEditor = useOpenAgentEditor();
  const goToAgentConsole = useAppStore((state) => state.goToAgentConsole);
  const updateAgent = useUpdateAgent(agent.id);
  const dragHandle = useContext(AgentDragHandleContext);
  const isPinned = agent.isPinned === true;

  return (
    <div className="flex items-center justify-between">
      {dragHandle !== undefined && (
        <button
          type="button"
          className="shrink-0 mr-1 p-1 rounded text-text-muted hover:text-text-neutral cursor-grab active:cursor-grabbing"
          onMouseDown={dragHandle.onMouseDown}
          onMouseUp={dragHandle.onMouseUp}
          aria-label={`Drag to reorder ${agent.name}`}
          title="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Name - click to toggle collapse/expand */}
      <div className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer select-none" onClick={onToggleExpand}>
        <h3 className="text-sm font-semibold text-text-base truncate">{agent.name}</h3>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-1.5 mr-2 shrink-0">
        <span
          className={`shrink-0 w-2 h-2 rounded-full ${STATUS_DOT_COLOR[status]} ${status === AGENT_STATUS.STREAMING ? "animate-pulse" : ""}`}
        />
        <span className={`text-xs font-medium ${STATUS_TEXT_COLOR[status]}`}>{STATUS_LABEL[status]}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {!agent.isSystemAgent && (
          <button
            type="button"
            className="p-1.5 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors"
            onClick={(event) => {
              event.stopPropagation();
              updateAgent.mutate({ isPinned: !isPinned });
            }}
            title={isPinned ? "Unpin agent" : "Pin agent"}
          >
            {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        )}
        {!agent.isSystemAgent && (
          <button
            type="button"
            className="p-1.5 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors"
            onClick={(event) => {
              event.stopPropagation();
              openAgentEditor({ agentId: agent.id });
            }}
            title="Edit agent"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="p-1.5 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors"
          onClick={(event) => {
            event.stopPropagation();
            goToAgentConsole(agent.id);
          }}
          title="Open console"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
