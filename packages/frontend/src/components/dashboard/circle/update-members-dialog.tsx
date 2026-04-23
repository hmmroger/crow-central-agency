import { useCallback } from "react";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../../common/action-button.js";
import { MemberListItem } from "./member-list-item.js";
import { useCircleMembershipEditor } from "./use-circle-membership-editor.js";

interface UpdateMembersDialogProps {
  circleId: string;
  onClose: () => void;
}

/**
 * Toggle agent and circle membership in a circle.
 * All changes are local until the user clicks Save.
 */
export function UpdateMembersDialog({ circleId, onClose }: UpdateMembersDialogProps) {
  const membership = useCircleMembershipEditor(circleId, true);
  const hasOptions = membership.agentOptions.length > 0 || membership.circleOptions.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!membership.hasChanges || membership.isSaving) {
      return;
    }

    try {
      await membership.applyMembershipChanges(circleId);
      onClose();
    } catch {
      // error rendered below
    }
  }, [membership, circleId, onClose]);

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-3 w-sm">
        <div className="flex flex-col gap-3 max-h-72 overflow-y-auto p-1">
          {!hasOptions && <p className="text-xs text-text-muted text-center py-3">No agents or circles available</p>}

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
                    disabled={membership.isSaving}
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
                    disabled={membership.isSaving}
                    onToggle={membership.handleToggleMember}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {membership.membershipError && <p className="text-xs text-error">{membership.membershipError.message}</p>}
      </div>

      <div className="flex justify-end gap-2 px-3 py-2 bg-surface-elevated">
        <ActionButton label="Cancel" onClick={onClose} disabled={membership.isSaving} />
        <ActionButton
          label={membership.isSaving ? "Saving..." : "Save"}
          variant={ACTION_BUTTON_VARIANT.PRIMARY}
          onClick={handleSubmit}
          disabled={!membership.hasChanges || membership.isSaving}
        />
      </div>
    </div>
  );
}
