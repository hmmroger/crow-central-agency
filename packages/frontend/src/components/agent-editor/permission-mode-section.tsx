import { PERMISSION_MODE, type PermissionMode } from "@crow-central-agency/shared";
import { FieldGroup } from "./field-group.js";

interface PermissionModeSectionProps {
  permissionMode: PermissionMode;
  onPermissionModeChange: (value: PermissionMode) => void;
}

/** Permission mode dropdown */
export function PermissionModeSection({ permissionMode, onPermissionModeChange }: PermissionModeSectionProps) {
  return (
    <FieldGroup label="Permission Mode">
      <select
        value={permissionMode}
        onChange={(event) => onPermissionModeChange(event.target.value as PermissionMode)}
        className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-border-focus"
      >
        <option value={PERMISSION_MODE.DEFAULT}>Default</option>
        <option value={PERMISSION_MODE.ACCEPT_EDITS}>Accept Edits</option>
        <option value={PERMISSION_MODE.PLAN}>Plan</option>
        <option value={PERMISSION_MODE.DONT_ASK}>Don&apos;t Ask</option>
        <option value={PERMISSION_MODE.BYPASS_PERMISSIONS}>Bypass Permissions</option>
      </select>
    </FieldGroup>
  );
}
