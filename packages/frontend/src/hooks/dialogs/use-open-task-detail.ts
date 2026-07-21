import { useCallback } from "react";
import type { AgentTaskItem } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { TaskDetailDialog, type TaskDetailMode } from "../../components/tasks/task-detail-dialog.js";

/** Dialog ID prefix for task detail modals */
const TASK_DETAIL_DIALOG_ID = "task-detail";

/**
 * Hook to open the task detail dialog for a given task.
 *
 * @param task - The task to view and optionally respond to.
 * @param initialMode - Mode the dialog opens in (defaults to the dialog's own default).
 * @returns A stable callback that opens the detail dialog for the specified task.
 */
export function useOpenTaskDetail(task: AgentTaskItem, initialMode?: TaskDetailMode) {
  const { showDialog } = useModalDialog();

  return useCallback(() => {
    showDialog({
      id: `${TASK_DETAIL_DIALOG_ID}-${task.id}`,
      component: TaskDetailDialog,
      componentProps: { task, initialMode },
      title: "Task Detail",
      className: "w-[95vw] md:w-3xl h-[60vh] flex flex-col",
    });
  }, [showDialog, task, initialMode]);
}
