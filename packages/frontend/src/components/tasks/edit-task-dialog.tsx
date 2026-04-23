import { useCallback, useState, type ChangeEvent } from "react";
import { useUpdateTask } from "../../hooks/queries/use-task-mutations.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { cn } from "../../utils/cn.js";

interface EditTaskDialogProps {
  /** The task ID to edit */
  taskId: string;
  /** Current task content (pre-filled) */
  currentContent: string;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Modal content for editing an OPEN task's description.
 * Pre-fills with the current content and submits the update.
 */
export function EditTaskDialog({ taskId, currentContent, onClose }: EditTaskDialogProps) {
  const [taskContent, setTaskContent] = useState(currentContent);
  const updateTask = useUpdateTask();

  const hasChanged = taskContent.trim() !== currentContent.trim();
  const canSubmit = taskContent.trim().length > 0 && hasChanged && !updateTask.isPending;

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setTaskContent(event.target.value);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    try {
      await updateTask.mutateAsync({ taskId, input: { task: taskContent.trim() } });
      onClose();
    } catch {
      // Error accessible via updateTask.error if needed
    }
  }, [canSubmit, updateTask, taskId, taskContent, onClose]);

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-3 w-md">
        <div className="space-y-1.5">
          <label htmlFor="edit-task-content" className="text-xs font-medium text-text-neutral uppercase tracking-wide">
            Task Description
          </label>
          <textarea
            id="edit-task-content"
            className={cn(
              "w-full h-28 px-3 py-2 rounded-md text-sm text-text-base",
              "bg-surface-inset border border-border-subtle",
              "placeholder:text-text-muted/60 resize-none",
              "focus:outline-none focus:border-border-focus",
              "transition-colors"
            )}
            value={taskContent}
            onChange={handleChange}
            autoFocus
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} disabled={updateTask.isPending} />
        <ActionButton
          label={updateTask.isPending ? "Saving..." : "Save Changes"}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          onClick={handleSubmit}
          disabled={!canSubmit}
        />
      </div>
    </div>
  );
}
