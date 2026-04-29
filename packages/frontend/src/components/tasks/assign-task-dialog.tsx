import { useCallback, useState } from "react";
import { Bot, User } from "lucide-react";
import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import { useAssignTask } from "../../hooks/queries/use-task-mutations.js";
import { useAgentsContext } from "../../providers/agents-provider.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { USER_SELF_SELECTION } from "../common/agent-selector.js";
import { AssigneeItem } from "./assignee-item.js";

interface AssignTaskDialogProps {
  /** The task ID to assign */
  taskId: string;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Modal content for assigning an OPEN task to an agent or the user.
 * Shows a selectable list with keyboard navigation.
 */
export function AssignTaskDialog({ taskId, onClose }: AssignTaskDialogProps) {
  const [selectedTarget, setSelectedTarget] = useState("");
  const assignTask = useAssignTask();
  const { agents } = useAgentsContext();

  const canSubmit = selectedTarget.length > 0 && !assignTask.isPending;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    try {
      const ownerSource =
        selectedTarget === USER_SELF_SELECTION
          ? { sourceType: AGENT_TASK_SOURCE_TYPE.USER }
          : { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: selectedTarget };
      await assignTask.mutateAsync({ taskId, input: { ownerSource } });
      onClose();
    } catch {
      // Error accessible via assignTask.error if needed
    }
  }, [canSubmit, selectedTarget, assignTask, taskId, onClose]);

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-3 w-[24rem]">
        <p className="text-xs text-text-muted">Select who should handle this task.</p>

        {/* Assignee list */}
        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto p-1">
          {/* User self-assignment option */}
          <AssigneeItem
            id={USER_SELF_SELECTION}
            label="Myself"
            icon={User}
            isSelected={selectedTarget === USER_SELF_SELECTION}
            disabled={assignTask.isPending}
            onSelect={setSelectedTarget}
          />

          {/* Agent options */}
          {agents.map((agent) => (
            <AssigneeItem
              key={agent.id}
              id={agent.id}
              label={agent.name}
              icon={Bot}
              isSelected={agent.id === selectedTarget}
              disabled={assignTask.isPending}
              onSelect={setSelectedTarget}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} disabled={assignTask.isPending} />
        <ActionButton
          label={assignTask.isPending ? "Assigning..." : "Assign"}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          onClick={handleSubmit}
          disabled={!canSubmit}
        />
      </div>
    </div>
  );
}
