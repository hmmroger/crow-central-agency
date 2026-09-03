import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { ScheduleEditorDialogContent } from "../../components/schedules/schedule-editor-dialog-content.js";

/** Dialog ID prefix for schedule editor modals */
const SCHEDULE_EDITOR_DIALOG_ID = "schedule-editor";

/**
 * Hook to open the schedule editor as a modal dialog.
 *
 * @returns A function that opens the editor — pass a scheduleId to edit, omit to create new.
 */
export function useOpenScheduleEditor() {
  const { showDialog } = useModalDialog();

  return useCallback(
    (scheduleId?: string) => {
      const dialogId = scheduleId ? `${SCHEDULE_EDITOR_DIALOG_ID}-${scheduleId}` : `${SCHEDULE_EDITOR_DIALOG_ID}-new`;

      showDialog({
        id: dialogId,
        title: scheduleId ? "Edit Schedule" : "New Schedule",
        component: ScheduleEditorDialogContent,
        componentProps: { scheduleId },
        className: "w-(--width-editor-dialog) max-w-2xl max-h-(--max-height-editor-dialog) flex flex-col",
      });
    },
    [showDialog]
  );
}
