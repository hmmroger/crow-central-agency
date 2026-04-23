import type { PermissionMode } from "@crow-central-agency/shared";
import { FieldGroup } from "./field-group.js";
import { PermissionModeSelector } from "./permission-mode-selector.js";

interface PermissionModeSectionProps {
  permissionMode: PermissionMode;
  onPermissionModeChange: (value: PermissionMode) => void;
}

/** Permission mode dropdown */
export function PermissionModeSection({ permissionMode, onPermissionModeChange }: PermissionModeSectionProps) {
  return (
    <FieldGroup label="Permission Mode">
      <PermissionModeSelector
        value={permissionMode}
        onChange={onPermissionModeChange}
        menuId="agent-editor-permission-mode"
      />
    </FieldGroup>
  );
}
