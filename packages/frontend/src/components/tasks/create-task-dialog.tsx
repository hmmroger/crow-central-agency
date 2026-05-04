import { useCallback, useState, type ChangeEvent } from "react";
import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import { useCreateTask } from "../../hooks/queries/use-task-mutations.js";
import { useAgentsContext } from "../../providers/agents-provider.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { AgentSelector, USER_SELF_SELECTION } from "../common/agent-selector.js";
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
  const [selectedOwner, setSelectedOwner] = useState("");
  const createTask = useCreateTask();
  const { agents } = useAgentsContext();

  const canSubmit = taskContent.trim().length > 0 && !createTask.isPending;

  const handleContentChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setTaskContent(event.target.value);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    try {
      await createTask.mutateAsync({
        task: taskContent.trim(),
        ownerSource: selectedOwner
          ? selectedOwner === USER_SELF_SELECTION
            ? { sourceType: AGENT_TASK_SOURCE_TYPE.USER }
            : { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: selectedOwner }
          : undefined,
      });
      onClose();
    } catch {
      // Error accessible via createTask.error if needed
    }
  }, [canSubmit, createTask, taskContent, selectedOwner, onClose]);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="p-3 space-y-3">
        {/* Task description */}
        <div className="space-y-1.5">
          <label htmlFor="task-content" className="text-xs font-medium text-text-neutral uppercase tracking-wide">
            Task Description
          </label>
          <textarea
            id="task-content"
            className={cn(
              "w-full h-28 px-3 py-2 rounded-md text-sm text-text-base",
              "bg-surface-inset border border-border-subtle",
              "placeholder:text-text-muted/60 resize-none",
              "focus:outline-none focus:border-border-focus",
              "transition-colors"
            )}
            placeholder="Describe what needs to be done..."
            value={taskContent}
            onChange={handleContentChange}
            autoFocus
          />
        </div>

        {/* Agent assignment (optional) */}
        <div className="space-y-1.5">
          <label
            htmlFor="create-task-agent-selector"
            className="text-xs font-medium text-text-neutral uppercase tracking-wide"
          >
            Assign to <span className="text-text-muted font-normal normal-case">(optional)</span>
          </label>
          <AgentSelector
            agents={agents}
            value={selectedOwner}
            onChange={setSelectedOwner}
            showUserOption
            menuId="create-task-agent-selector-menu"
            buttonId="create-task-agent-selector"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} disabled={createTask.isPending} />
        <ActionButton
          label={createTask.isPending ? "Creating..." : "Create Task"}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          onClick={handleSubmit}
          disabled={!canSubmit}
        />
      </div>
    </div>
  );
}
