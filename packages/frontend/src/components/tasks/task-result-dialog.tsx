import { useCallback, useState, type ChangeEvent } from "react";
import type { UpdateTaskStateInput } from "@crow-central-agency/shared";
import { useUpdateTaskState } from "../../hooks/queries/use-task-mutations.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { cn } from "../../utils/cn.js";

interface TaskResultDialogProps {
  /** The task ID to transition */
  taskId: string;
  /** Target state to transition the task into */
  state: UpdateTaskStateInput["state"];
  /** When true, a non-empty result is required before submitting */
  resultRequired: boolean;
  /** Label for the result textarea */
  resultLabel: string;
  /** Label for the confirm button */
  confirmLabel: string;
  /** Body text explaining what the result is used for */
  description: string;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/** Modal content for transitioning a task to a new state, optionally capturing a result. */
export function TaskResultDialog({
  taskId,
  state,
  resultRequired,
  resultLabel,
  confirmLabel,
  description,
  onClose,
}: TaskResultDialogProps) {
  const [result, setResult] = useState("");
  const updateTaskState = useUpdateTaskState();
  const [error, setError] = useState<string | undefined>(undefined);

  const trimmedResult = result.trim();
  const canSubmit = (!resultRequired || trimmedResult.length > 0) && !updateTaskState.isPending;

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setResult(event.target.value);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    setError(undefined);
    try {
      await updateTaskState.mutateAsync({
        taskId,
        input: { state, ...(trimmedResult.length > 0 && { taskResult: trimmedResult }) },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }, [canSubmit, updateTaskState, taskId, state, trimmedResult, onClose]);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="p-3 space-y-3">
        <p className="text-sm text-text-neutral">{description}</p>
        <div className="space-y-1.5">
          <label
            htmlFor="task-result-content"
            className="text-xs font-medium text-text-neutral uppercase tracking-wide"
          >
            {resultLabel}
          </label>
          <textarea
            id="task-result-content"
            className={cn(
              "w-full h-28 px-3 py-2 rounded-md text-sm text-text-base",
              "bg-surface-inset border border-border-subtle",
              "placeholder:text-text-muted/60 resize-none",
              "focus:outline-none focus:border-border-focus",
              "transition-colors"
            )}
            value={result}
            onChange={handleChange}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>

      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} disabled={updateTaskState.isPending} />
        <ActionButton
          label={updateTaskState.isPending ? "..." : confirmLabel}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          onClick={handleSubmit}
          disabled={!canSubmit}
        />
      </div>
    </div>
  );
}
