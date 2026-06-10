import type { AgentType, PermissionMode } from "@crow-central-agency/shared";
import { FieldGroup } from "./field-group.js";
import { PermissionModeSelector } from "./permission-mode-selector.js";

interface PermissionModeSectionProps {
  permissionMode: PermissionMode;
  agentType: AgentType;
  onPermissionModeChange: (value: PermissionMode) => void;
}

/** Permission mode dropdown */
export function PermissionModeSection({
  permissionMode,
  agentType,
  onPermissionModeChange,
}: PermissionModeSectionProps) {
  return (
    <FieldGroup label="Permission Mode">
      <PermissionModeSelector
        value={permissionMode}
        agentType={agentType}
        onChange={onPermissionModeChange}
        menuId="agent-editor-permission-mode"
      />
    </FieldGroup>
  );
}
