import { useCallback, useImperativeHandle } from "react";
import type { Ref } from "react";
import { SCHEDULE_NAME_MAX_LENGTH, MAX_SCHEDULE_TIMES, type CreateScheduleInput } from "@crow-central-agency/shared";
import { useConfirmDiscard } from "../../hooks/dialogs/use-confirm-discard.js";
import { useSchedulesQuery } from "../../hooks/queries/use-schedules-query.js";
import { useCreateSchedule, useUpdateSchedule } from "../../hooks/queries/use-schedule-mutations.js";
import type { ModalDialogHandle } from "../../providers/modal-dialog-provider.types.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "../agent-editor/field-group.js";
import { formatScheduleTiming } from "../../utils/format-schedule-timing.js";
import { ScheduleTimingPanel } from "./schedule-timing-panel.js";
import { ScheduleAgentSelect } from "./schedule-agent-select.js";
import { useScheduleEditorForm } from "./use-schedule-editor-form.js";

interface ScheduleEditorDialogContentProps {
  scheduleId?: string;
  /** Injected by modal dialog provider */
  onClose: () => void;
  /** Injected by modal dialog renderer for dismiss guard */
  ref: Ref<ModalDialogHandle>;
}

/**
 * Schedule editor rendered as modal dialog content.
 * Handles create and edit flows with dirty tracking.
 */
export function ScheduleEditorDialogContent({ scheduleId, onClose, ref }: ScheduleEditorDialogContentProps) {
  const isEditing = scheduleId !== undefined;

  const { data: schedules = [] } = useSchedulesQuery();
  const existingSchedule = isEditing ? schedules.find((schedule) => schedule.id === scheduleId) : undefined;

  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule(scheduleId ?? "");
  const saveMutation = isEditing ? updateSchedule : createSchedule;
  const isSaving = saveMutation.isPending;
  const mutationError = saveMutation.error?.message;

  const editorForm = useScheduleEditorForm(existingSchedule);
  const { form, isDirty } = editorForm;

  const confirmDiscard = useConfirmDiscard(isDirty);

  useImperativeHandle(ref, () => ({ canDismiss: confirmDiscard }), [confirmDiscard]);

  const canSave =
    !isSaving &&
    form.name.trim() !== "" &&
    form.message.trim() !== "" &&
    form.agentIds.length > 0 &&
    (isEditing ? isDirty : true);

  const handleSave = useCallback(async () => {
    const input: CreateScheduleInput = {
      name: form.name.trim(),
      message: form.message.trim(),
      enabled: form.enabled,
      agentIds: form.agentIds,
      daysOfWeek: form.daysOfWeek,
      timeMode: form.timeMode,
      times: form.times,
    };

    try {
      if (isEditing) {
        await updateSchedule.mutateAsync(input);
      } else {
        await createSchedule.mutateAsync(input);
      }

      onClose();
    } catch {
      // Error surfaced via mutation.error
    }
  }, [form, isEditing, updateSchedule, createSchedule, onClose]);

  const handleCancel = useCallback(async () => {
    const allowed = await confirmDiscard();
    if (allowed) {
      onClose();
    }
  }, [confirmDiscard, onClose]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
        {mutationError && (
          <div className="p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm animate-fade-slide-up">
            {mutationError}
          </div>
        )}

        <FieldGroup label="Name" required>
          <input
            type="text"
            value={form.name}
            onChange={(event) => editorForm.setName(event.target.value)}
            placeholder="Morning brief"
            maxLength={SCHEDULE_NAME_MAX_LENGTH}
            className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
        </FieldGroup>

        <FieldGroup label="Message" required>
          <textarea
            value={form.message}
            onChange={(event) => editorForm.setMessage(event.target.value)}
            placeholder="What the target agents should do on each run..."
            rows={5}
            className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
          />
        </FieldGroup>

        <FieldGroup
          label="Timing"
          action={<span className="text-3xs text-text-muted">{formatScheduleTiming(form)}</span>}
        >
          <ScheduleTimingPanel
            daysOfWeek={form.daysOfWeek}
            timeMode={form.timeMode}
            times={form.times}
            maxTimes={MAX_SCHEDULE_TIMES}
            onDaysChange={editorForm.setDaysOfWeek}
            onTimeModeChange={editorForm.setTimeMode}
            onTimesChange={editorForm.setTimes}
          />
        </FieldGroup>

        <FieldGroup label="Target agents" required>
          <ScheduleAgentSelect selectedAgentIds={form.agentIds} onToggle={editorForm.toggleAgent} />
        </FieldGroup>

        <Toggle checked={form.enabled} onChange={editorForm.setEnabled} label="Enabled" />
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={handleCancel} />
        <ActionButton
          label={isEditing ? (isSaving ? "Saving..." : "Save") : isSaving ? "Creating..." : "Create"}
          onClick={handleSave}
          disabled={!canSave}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
        />
      </div>
    </div>
  );
}
