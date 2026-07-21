import type { ComponentType } from "react";
import { AGENT_TASK_STATE, type AgentTaskItem } from "@crow-central-agency/shared";
import { Pencil, UserPlus, XCircle, CheckCircle, Trash2, Loader } from "lucide-react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { useDeleteTask } from "../../hooks/queries/use-task-mutations.js";
import { canEditTask, canAssignTask, canCloseTask, canCompleteTask, canDeleteTask } from "../../utils/task-utils.js";
import { ConfirmationDialog } from "../common/dialogs/confirmation-dialog.js";
import { TaskResultDialog } from "./task-result-dialog.js";
import { EditTaskDialog } from "./edit-task-dialog.js";
import { AssignTaskDialog } from "./assign-task-dialog.js";
import { cn } from "../../utils/cn.js";

const ACTION_BUTTON_TONE = {
  NEUTRAL: "neutral",
  SUCCESS: "success",
  DESTRUCTIVE: "destructive",
} as const;

type ActionButtonTone = (typeof ACTION_BUTTON_TONE)[keyof typeof ACTION_BUTTON_TONE];

const ACTION_BUTTON_TONE_CLASS: Record<ActionButtonTone, string> = {
  [ACTION_BUTTON_TONE.NEUTRAL]: "text-text-muted hover:text-text-base hover:bg-surface-elevated",
  [ACTION_BUTTON_TONE.SUCCESS]: "text-success hover:bg-success/10",
  [ACTION_BUTTON_TONE.DESTRUCTIVE]: "text-error hover:bg-error/10",
};

interface ActionButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: ActionButtonTone;
}

interface TaskActionsProps {
  task: AgentTaskItem;
}

/**
 * Contextual action buttons for a task card.
 * Shows only the actions valid for the current task state.
 * Active tasks show a working indicator instead of actions.
 */
export function TaskActions({ task }: TaskActionsProps) {
  const { showDialog } = useModalDialog();
  const deleteTask = useDeleteTask();

  const isActive = task.state === AGENT_TASK_STATE.ACTIVE;

  if (isActive) {
    return (
      <span className="flex items-center gap-1.5 text-3xs text-accent font-mono">
        <Loader className="w-3 h-3 animate-spin" />
        Agent working
      </span>
    );
  }

  const handleEdit = () => {
    showDialog({
      id: "edit-task",
      component: EditTaskDialog,
      componentProps: { taskId: task.id, currentContent: task.task },
      title: "Edit Task",
      className: "w-[95vw] md:w-md",
    });
  };

  const handleAssign = () => {
    showDialog({
      id: "assign-task",
      component: AssignTaskDialog,
      componentProps: { taskId: task.id },
      title: "Assign Task",
      className: "w-[95vw] md:w-md",
      listNavigation: true,
    });
  };

  const handleComplete = () => {
    showDialog({
      id: "complete-task",
      component: TaskResultDialog,
      componentProps: {
        taskId: task.id,
        state: AGENT_TASK_STATE.COMPLETED,
        confirmLabel: "Complete Task",
        description: "Complete this task. Optionally add a result note.",
      },
      title: "Complete Task",
      className: "w-[95vw] md:w-md",
    });
  };

  const handleClose = () => {
    showDialog({
      id: "close-task",
      component: TaskResultDialog,
      componentProps: {
        taskId: task.id,
        state: AGENT_TASK_STATE.CLOSED,
        confirmLabel: "Close Task",
        description: "Close this task. Optionally add a result note. It can only be deleted after closing.",
      },
      title: "Close Task",
      className: "w-[95vw] md:w-md",
    });
  };

  const handleDelete = () => {
    showDialog({
      id: "delete-task",
      component: ConfirmationDialog,
      componentProps: {
        message: "Permanently delete this task? This action cannot be undone.",
        confirmLabel: "Delete",
        destructive: true,
        onConfirm: async () => {
          await deleteTask.mutateAsync(task.id);
        },
      },
      title: "Delete Task",
      className: "w-80",
      role: "alertdialog",
    });
  };

  return (
    <div className="flex items-center gap-0.5">
      {canEditTask(task.state) && <ActionButton icon={Pencil} label="Edit" onClick={handleEdit} />}
      {canAssignTask(task.state) && <ActionButton icon={UserPlus} label="Assign" onClick={handleAssign} />}
      {canCompleteTask(task) && (
        <ActionButton icon={CheckCircle} label="Complete" onClick={handleComplete} tone={ACTION_BUTTON_TONE.SUCCESS} />
      )}
      {canCloseTask(task.state) && <ActionButton icon={XCircle} label="Close" onClick={handleClose} />}
      {canDeleteTask(task.state) && (
        <ActionButton icon={Trash2} label="Delete" onClick={handleDelete} tone={ACTION_BUTTON_TONE.DESTRUCTIVE} />
      )}
    </div>
  );
}

/** Small icon-only action button with tooltip */
function ActionButton({ icon: Icon, label, onClick, tone = ACTION_BUTTON_TONE.NEUTRAL }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={cn("p-1.5 rounded-md transition-colors", ACTION_BUTTON_TONE_CLASS[tone])}
      onClick={onClick}
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
