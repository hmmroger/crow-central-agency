import type { ComponentType } from "react";
import { AGENT_TASK_STATE, type AgentTaskItem } from "@crow-central-agency/shared";
import { Pencil, UserPlus, XCircle, Trash2, Loader } from "lucide-react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { useDeleteTask, useUpdateTaskState } from "../../hooks/queries/use-task-mutations.js";
import { canEditTask, canAssignTask, canCloseTask, canDeleteTask } from "../../utils/task-utils.js";
import { ConfirmationDialog } from "../common/dialogs/confirmation-dialog.js";
import { EditTaskDialog } from "./edit-task-dialog.js";
import { AssignTaskDialog } from "./assign-task-dialog.js";
import { cn } from "../../utils/cn.js";

interface ActionButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  isDestructive?: boolean;
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
  const updateTaskState = useUpdateTaskState();

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

  const handleClose = () => {
    showDialog({
      id: "close-task",
      component: ConfirmationDialog,
      componentProps: {
        message: "Close this task? It can only be deleted after closing.",
        confirmLabel: "Close Task",
        onConfirm: async () => {
          await updateTaskState.mutateAsync({
            taskId: task.id,
            input: { state: AGENT_TASK_STATE.CLOSED },
          });
        },
      },
      title: "Close Task",
      className: "w-80",
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
      {canCloseTask(task.state) && <ActionButton icon={XCircle} label="Close" onClick={handleClose} />}
      {canDeleteTask(task.state) && <ActionButton icon={Trash2} label="Delete" onClick={handleDelete} isDestructive />}
    </div>
  );
}

/** Small icon-only action button with tooltip */
function ActionButton({ icon: Icon, label, onClick, isDestructive }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "p-1.5 rounded-md transition-colors",
        isDestructive
          ? "text-text-muted hover:text-error hover:bg-error/10"
          : "text-text-muted hover:text-text-base hover:bg-surface-elevated"
      )}
      onClick={onClick}
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
