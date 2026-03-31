import { useState } from "react";
import { Bot } from "lucide-react";
import { useAssignTask } from "../../hooks/use-task-mutations.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { cn } from "../../utils/cn.js";

interface AssignTaskDialogProps {
  /** The task ID to assign */
  taskId: string;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Modal content for assigning an OPEN task to an agent.
 * Shows a selectable agent list with visual feedback.
 */
export function AssignTaskDialog({ taskId, onClose }: AssignTaskDialogProps) {
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const assignTask = useAssignTask();
  const { data: agents = [] } = useAgentsQuery();

  const canSubmit = selectedAgentId.length > 0 && !assignTask.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      await assignTask.mutateAsync({ taskId, input: { agentId: selectedAgentId } });
      onClose();
    } catch {
      // Error accessible via assignTask.error if needed
    }
  };

  return (
    <div className="p-4 space-y-4 w-[24rem]">
      <p className="text-xs text-text-muted">
        Select an agent to handle this task. The task will start when the agent is available.
      </p>

      {/* Agent list */}
      <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
        {agents.map((agent) => {
          const isSelected = agent.id === selectedAgentId;

          return (
            <button
              key={agent.id}
              type="button"
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-left",
                "transition-colors text-sm",
                isSelected
                  ? "bg-primary/12 border border-primary/30 text-primary"
                  : "border border-transparent hover:bg-surface-elevated text-text-secondary hover:text-text-primary"
              )}
              onClick={() => setSelectedAgentId(agent.id)}
            >
              <Bot className="w-4 h-4 shrink-0" />
              <span className="font-medium truncate">{agent.name}</span>
            </button>
          );
        })}
        {agents.length === 0 && <p className="text-sm text-text-muted text-center py-4">No agents available</p>}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          className="px-3 py-1.5 rounded-md text-sm text-text-muted border border-border-subtle hover:text-text-secondary transition-colors"
          onClick={onClose}
          disabled={assignTask.isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors disabled:opacity-40"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          {assignTask.isPending ? "Assigning..." : "Assign"}
        </button>
      </div>
    </div>
  );
}
