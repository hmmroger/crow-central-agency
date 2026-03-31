import { useState } from "react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { useCreateTask } from "../../hooks/use-task-mutations.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { cn } from "../../utils/cn.js";

interface CreateTaskDialogProps {
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Modal content for creating a new task.
 * Task description textarea + optional agent assignment dropdown.
 */
export function CreateTaskDialog({ onClose }: CreateTaskDialogProps) {
  const [taskContent, setTaskContent] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const createTask = useCreateTask();
  const { data: agents = [] } = useAgentsQuery();

  const canSubmit = taskContent.trim().length > 0 && !createTask.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      await createTask.mutateAsync({
        task: taskContent.trim(),
        assignToAgentId: selectedAgentId || undefined,
      });
      onClose();
    } catch {
      // Error accessible via createTask.error if needed
    }
  };

  return (
    <div className="p-4 space-y-4 w-[28rem]">
      {/* Task description */}
      <div className="space-y-1.5">
        <label htmlFor="task-content" className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Task Description
        </label>
        <textarea
          id="task-content"
          className={cn(
            "w-full h-28 px-3 py-2 rounded-md text-sm text-text-primary",
            "bg-surface-inset border border-border-subtle",
            "placeholder:text-text-muted/60 resize-none",
            "focus:outline-none focus:border-border-focus",
            "transition-colors"
          )}
          placeholder="Describe what needs to be done..."
          value={taskContent}
          onChange={(event) => setTaskContent(event.target.value)}
          autoFocus
        />
      </div>

      {/* Agent assignment (optional) */}
      <div className="space-y-1.5">
        <label htmlFor="agent-select" className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Assign to Agent <span className="text-text-muted font-normal normal-case">(optional)</span>
        </label>
        <AgentSelect agents={agents} value={selectedAgentId} onChange={setSelectedAgentId} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          className="px-3 py-1.5 rounded-md text-sm text-text-muted border border-border-subtle hover:text-text-secondary transition-colors"
          onClick={onClose}
          disabled={createTask.isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors disabled:opacity-40"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          {createTask.isPending ? "Creating..." : "Create Task"}
        </button>
      </div>
    </div>
  );
}

/** Styled agent selector dropdown */
function AgentSelect({
  agents,
  value,
  onChange,
}: {
  agents: AgentConfig[];
  value: string;
  onChange: (agentId: string) => void;
}) {
  return (
    <select
      id="agent-select"
      className={cn(
        "w-full px-3 py-2 rounded-md text-sm",
        "bg-surface-inset border border-border-subtle text-text-primary",
        "focus:outline-none focus:border-border-focus",
        "transition-colors appearance-none cursor-pointer"
      )}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">No assignment</option>
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  );
}
