import { useCallback, useState, type ChangeEvent } from "react";
import type { AgentCircle } from "@crow-central-agency/shared";
import { useCreateCircle, useUpdateCircle } from "../../../hooks/queries/use-circle-mutations.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../../common/action-button.js";
import { cn } from "../../../utils/cn.js";
import { MemberListItem } from "./member-list-item.js";
import { useCircleMembershipEditor } from "./use-circle-membership-editor.js";

interface CircleEditorDialogProps {
  /** Existing circle to edit. When undefined, the dialog creates a new circle. */
  circle?: AgentCircle;
  onClose: () => void;
}

/**
 * Create or edit a circle.
 * Supports setting name, convention, and managing agent membership.
 * All changes are local until the user clicks Save/Create.
 */
export function CircleEditorDialog({ circle, onClose }: CircleEditorDialogProps) {
  const isEditMode = circle !== undefined;

  const [name, setName] = useState(circle?.name ?? "");
  const [convention, setConvention] = useState(circle?.convention ?? "");

  const createCircle = useCreateCircle();
  const updateCircle = useUpdateCircle();

  const membership = useCircleMembershipEditor(circle?.id ?? "", isEditMode);

  const isSaving = createCircle.isPending || updateCircle.isPending || membership.isSaving;
  const canSubmit = name.trim().length > 0 && !isSaving;

  const handleNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);

  const handleConventionChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setConvention(event.target.value);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    try {
      let circleId: string;

      if (isEditMode) {
        await updateCircle.mutateAsync({
          circleId: circle.id,
          input: {
            name: name.trim(),
            convention: convention.trim(),
          },
        });
        circleId = circle.id;
      } else {
        const newCircle = await createCircle.mutateAsync({
          name: name.trim(),
          convention: convention.trim() || undefined,
        });
        circleId = newCircle.id;
      }

      await membership.applyMembershipChanges(circleId);
      onClose();
    } catch {
      // errors rendered below
    }
  }, [canSubmit, isEditMode, circle, name, convention, createCircle, updateCircle, membership, onClose]);

  const mutationError = createCircle.error ?? updateCircle.error ?? membership.membershipError;

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="p-3 space-y-3">
        {/* Name */}
        <div className="space-y-1.5">
          <label htmlFor="circle-name" className="text-xs font-medium text-text-neutral uppercase tracking-wide">
            Name
          </label>
          <input
            id="circle-name"
            type="text"
            className={cn(
              "w-full px-3 py-2 rounded-md text-sm text-text-base",
              "bg-surface-inset border border-border-subtle",
              "placeholder:text-text-muted/60",
              "focus:outline-none focus:border-border-focus",
              "transition-colors"
            )}
            placeholder="e.g. Engineering, Research..."
            value={name}
            onChange={handleNameChange}
            maxLength={64}
            autoFocus
          />
        </div>

        {/* Convention */}
        <div className="space-y-1.5">
          <label htmlFor="circle-convention" className="text-xs font-medium text-text-neutral uppercase tracking-wide">
            Convention
          </label>
          <textarea
            id="circle-convention"
            className={cn(
              "w-full px-3 py-2 rounded-md text-sm text-text-base",
              "bg-surface-inset border border-border-subtle",
              "placeholder:text-text-muted/60",
              "focus:outline-none focus:border-border-focus",
              "transition-colors resize-none"
            )}
            placeholder="Optional rules or conventions for agents in this circle..."
            value={convention}
            onChange={handleConventionChange}
            rows={3}
          />
        </div>

        {/* Members */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-text-neutral uppercase tracking-wide">Members</span>
          <div className="flex flex-col gap-3 max-h-48 overflow-y-auto p-1">
            {membership.agentOptions.length > 0 && (
              <div className="space-y-1">
                <span className="text-2xs font-medium text-text-muted uppercase tracking-wide px-1">Agents</span>
                <div className="flex flex-col gap-1">
                  {membership.agentOptions.map((option) => (
                    <MemberListItem
                      key={option.entityId}
                      entityId={option.entityId}
                      entityType={option.entityType}
                      name={option.name}
                      isSelected={membership.selectedMemberIds.has(option.entityId)}
                      disabled={isSaving}
                      onToggle={membership.handleToggleMember}
                    />
                  ))}
                </div>
              </div>
            )}
            {membership.circleOptions.length > 0 && (
              <div className="space-y-1">
                <span className="text-2xs font-medium text-text-muted uppercase tracking-wide px-1">Circles</span>
                <div className="flex flex-col gap-1">
                  {membership.circleOptions.map((option) => (
                    <MemberListItem
                      key={option.entityId}
                      entityId={option.entityId}
                      entityType={option.entityType}
                      name={option.name}
                      isSelected={membership.selectedMemberIds.has(option.entityId)}
                      disabled={isSaving}
                      onToggle={membership.handleToggleMember}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {mutationError && <p className="text-xs text-error">{mutationError.message}</p>}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} disabled={isSaving} />
        <ActionButton
          label={isSaving ? (isEditMode ? "Saving..." : "Creating...") : isEditMode ? "Save" : "Create Circle"}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          onClick={handleSubmit}
          disabled={!canSubmit}
        />
      </div>
    </div>
  );
}
