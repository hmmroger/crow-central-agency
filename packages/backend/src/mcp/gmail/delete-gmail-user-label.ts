import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const DELETE_GMAIL_USER_LABEL_TOOL_NAME = "delete_gmail_user_label";

export function getDeleteGmailUserLabelToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    labelId: z
      .string()
      .describe(
        "User label ID to delete. Discover IDs via list_gmail_labels (entries under 'User labels'). System label IDs are rejected. Deleting a label also removes it from every message it was attached to."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      await googleClient.deleteGmailUserLabel(args.labelId);
      return textToolResult(["User label deleted.", `Label ID: ${args.labelId}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to delete Gmail user label.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: DELETE_GMAIL_USER_LABEL_TOOL_NAME,
    description:
      "Delete a user-defined Gmail label by ID. Irreversible: the label is removed from every message it was attached to (messages themselves are unaffected). Only user labels can be deleted.",
    inputSchema,
    handler,
  };

  return config;
}
