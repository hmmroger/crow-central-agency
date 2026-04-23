import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { McpConfigEditorDialogContent } from "../../components/settings/mcp-config-editor-dialog-content.js";

/** Dialog ID prefix for MCP config editor modals */
const MCP_CONFIG_EDITOR_DIALOG_ID = "mcp-config-editor";

/**
 * Hook to open the MCP config editor as a modal dialog.
 *
 * @returns A function that opens the editor — pass a configId to edit, omit to create new.
 */
export function useOpenMcpConfigEditor() {
  const { showDialog } = useModalDialog();

  return useCallback(
    (configId?: string) => {
      const dialogId = configId ? `${MCP_CONFIG_EDITOR_DIALOG_ID}-${configId}` : `${MCP_CONFIG_EDITOR_DIALOG_ID}-new`;

      showDialog({
        id: dialogId,
        title: configId ? "Edit MCP Server" : "New MCP Server",
        component: McpConfigEditorDialogContent,
        componentProps: { configId },
        className: "w-(--width-editor-dialog) max-w-2xl max-h-(--max-height-editor-dialog) flex flex-col",
      });
    },
    [showDialog]
  );
}
