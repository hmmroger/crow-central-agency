import { useCallback, useImperativeHandle, useState, type ChangeEvent, type Ref } from "react";
import { AGENT_TASK_STATE, type AgentTaskItem } from "@crow-central-agency/shared";
import { useUpdateTaskResult, useUpdateTaskState } from "../../hooks/queries/use-task-mutations.js";
import { useConfirmDiscard } from "../../hooks/dialogs/use-confirm-discard.js";
import type { ModalDialogHandle } from "../../providers/modal-dialog-provider.types.js";
import { canCompleteTask, isTerminalTask } from "../../utils/task-utils.js";
import { MarkdownRenderer } from "../common/markdown-renderer.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { cn } from "../../utils/cn.js";

export const TASK_DETAIL_MODE = {
  VIEW: "view",
  RESPOND: "respond",
} as const;

export type TaskDetailMode = (typeof TASK_DETAIL_MODE)[keyof typeof TASK_DETAIL_MODE];

interface TaskDetailDialogProps {
  /** The task to view and optionally respond to */
  task: AgentTaskItem;
  /** Mode the dialog opens in (defaults to VIEW) */
  initialMode?: TaskDetailMode;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
  /** Injected by ModalDialogRenderer for dismiss guard */
  ref: Ref<ModalDialogHandle>;
}

/**
 * Task-specific detail dialog. Shows the task content and, when the task is in
 * the user's court, hosts an inline respond pane to draft, save, and submit a result.
 */
export function TaskDetailDialog({ task, initialMode = TASK_DETAIL_MODE.VIEW, onClose, ref }: TaskDetailDialogProps) {
  const canRespond = canCompleteTask(task);
  const [mode, setMode] = useState<TaskDetailMode>(
    initialMode === TASK_DETAIL_MODE.RESPOND && canRespond ? TASK_DETAIL_MODE.RESPOND : TASK_DETAIL_MODE.VIEW
  );
  const [response, setResponse] = useState(task.taskResult ?? "");
  const [savedBaseline, setSavedBaseline] = useState(task.taskResult ?? "");
  const [error, setError] = useState<string | undefined>(undefined);

  const updateTaskResult = useUpdateTaskResult();
  const updateTaskState = useUpdateTaskState();

  const isResponding = mode === TASK_DETAIL_MODE.RESPOND;
  const isDirty = response !== savedBaseline;
  const isBusy = updateTaskResult.isPending || updateTaskState.isPending;
  const showTerminalResult = !isResponding && isTerminalTask(task.state) && Boolean(task.taskResult);

  const confirmDiscard = useConfirmDiscard(isDirty);
  useImperativeHandle(ref, () => ({ canDismiss: confirmDiscard }), [confirmDiscard]);

  const handleRespond = useCallback(() => {
    setError(undefined);
    setMode(TASK_DETAIL_MODE.RESPOND);
  }, []);

  const handleCancel = useCallback(() => {
    setResponse(savedBaseline);
    setError(undefined);
    setMode(TASK_DETAIL_MODE.VIEW);
  }, [savedBaseline]);

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setResponse(event.target.value);
  }, []);

  const handleSave = useCallback(async () => {
    if (!isDirty || isBusy) {
      return;
    }

    setError(undefined);
    try {
      await updateTaskResult.mutateAsync({ taskId: task.id, input: { taskResult: response } });
      setSavedBaseline(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }, [isDirty, isBusy, updateTaskResult, task.id, response]);

  const handleComplete = useCallback(async () => {
    if (isBusy) {
      return;
    }

    setError(undefined);
    try {
      await updateTaskState.mutateAsync({
        taskId: task.id,
        input: { state: AGENT_TASK_STATE.COMPLETED, taskResult: response },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }, [isBusy, updateTaskState, task.id, response, onClose]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Task content — fills available height, shrinks to make room for the respond pane */}
      <div className="flex-1 min-h-0 overflow-y-auto m-3 p-3 rounded-md bg-surface-inset border border-border-subtle">
        <MarkdownRenderer content={task.task} />

        {showTerminalResult && task.taskResult && (
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <p className="mb-1.5 text-xs font-medium text-text-neutral uppercase tracking-wide">Result</p>
            <MarkdownRenderer content={task.taskResult} />
          </div>
        )}
      </div>

      {/* Respond pane — slides up when composing a response */}
      {isResponding && (
        <div className="px-3 pb-2 space-y-1.5 animate-fade-slide-up">
          <label
            htmlFor="task-detail-response"
            className="text-xs font-medium text-text-neutral uppercase tracking-wide"
          >
            Your Response
          </label>
          <textarea
            id="task-detail-response"
            className={cn(
              "w-full h-28 px-3 py-2 rounded-md text-sm text-text-base",
              "bg-surface-inset border border-border-subtle",
              "placeholder:text-text-muted/60 resize-none",
              "focus:outline-none focus:border-border-focus",
              "transition-colors duration-(--duration-fast)"
            )}
            value={response}
            onChange={handleChange}
            disabled={isBusy}
            autoFocus
          />
        </div>
      )}

      {error && <p className="px-3 pb-1 text-xs text-error">{error}</p>}

      {/* Footer actions — differ by mode */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 bg-surface-elevated">
        {isResponding ? (
          <>
            <ActionButton label="Cancel" onClick={handleCancel} disabled={isBusy} />
            <ActionButton
              label={updateTaskResult.isPending ? "Saving..." : "Save"}
              variant={ACTION_BUTTON_VARIANT.PRIMARY}
              onClick={handleSave}
              disabled={!isDirty || isBusy}
            />
            <ActionButton
              label={updateTaskState.isPending ? "..." : "Complete Task"}
              variant={ACTION_BUTTON_VARIANT.PRIMARY_SOLID}
              onClick={handleComplete}
              disabled={isBusy}
            />
          </>
        ) : (
          <>
            {canRespond && (
              <ActionButton label="Respond" variant={ACTION_BUTTON_VARIANT.PRIMARY} onClick={handleRespond} />
            )}
            <ActionButton label="Close" onClick={onClose} />
          </>
        )}
      </div>
    </div>
  );
}
