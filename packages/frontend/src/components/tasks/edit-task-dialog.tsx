import { useState } from "react";
import { useUpdateTask } from "../../hooks/use-task-mutations.js";
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
  const [isPending, setIsPending] = useState(false);
  const updateTask = useUpdateTask();

  const hasChanged = taskContent.trim() !== currentContent;
  const canSubmit = taskContent.trim().length > 0 && hasChanged && !isPending;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    setIsPending(true);

    try {
      await updateTask.mutateAsync({ taskId, input: { task: taskContent.trim() } });
      onClose();
    } catch {
      setIsPending(false);
    }
  };

  return (
    <div className="p-4 space-y-4 w-[28rem]">
      <div className="space-y-1.5">
        <label htmlFor="edit-task-content" className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Task Description
        </label>
        <textarea
          id="edit-task-content"
          className={cn(
            "w-full h-28 px-3 py-2 rounded-md text-sm text-text-primary",
            "bg-surface-inset border border-border-subtle",
            "placeholder:text-text-muted/60 resize-none",
            "focus:outline-none focus:border-border-focus",
            "transition-colors"
          )}
          value={taskContent}
          onChange={(event) => setTaskContent(event.target.value)}
          autoFocus
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          className="px-3 py-1.5 rounded-md text-sm text-text-muted border border-border-subtle hover:text-text-secondary transition-colors"
          onClick={onClose}
          disabled={isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors disabled:opacity-40"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          {isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
