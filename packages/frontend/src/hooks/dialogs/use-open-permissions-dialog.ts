import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { PermissionsDialog } from "../../components/agent-editor/tool-config/permissions-dialog.js";

const PERMISSIONS_DIALOG_ID = "permissions-editor";

interface OpenPermissionsDialogArgs {
  effectiveTools: string[];
  autoApprovedTools: string[];
  disallowedTools: string[];
  mcpServerNames: string[];
  internalMcpServerNames: string[];
  onSave: (autoApprovedTools: string[], disallowedTools: string[]) => void;
}

export function useOpenPermissionsDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(
    ({
      effectiveTools,
      autoApprovedTools,
      disallowedTools,
      mcpServerNames,
      internalMcpServerNames,
      onSave,
    }: OpenPermissionsDialogArgs) => {
      showDialog({
        id: PERMISSIONS_DIALOG_ID,
        component: PermissionsDialog,
        componentProps: {
          effectiveTools,
          autoApprovedTools,
          disallowedTools,
          mcpServerNames,
          internalMcpServerNames,
          onSave,
        },
        title: "Permissions",
        className: "w-[95vw] md:w-xl",
      });
    },
    [showDialog]
  );
}
