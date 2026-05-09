import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const UPDATE_GMAIL_MESSAGE_USER_LABELS_TOOL_NAME = "update_gmail_message_user_labels";

export function getUpdateGmailMessageUserLabelsToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    messageId: z.string().describe("Gmail message ID (from list_gmail_messages or get_gmail_thread results)."),
    addLabelIds: z
      .array(z.string())
      .optional()
      .describe(
        `User label IDs to attach to the message. Discover IDs via list_gmail_labels (entries under "User labels").`
      ),
    removeLabelIds: z
      .array(z.string())
      .optional()
      .describe(
        `User label IDs to detach from the message. Discover IDs via list_gmail_labels (entries under "User labels").`
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.updateGmailMessageUserLabels({
        messageId: args.messageId,
        addLabelIds: args.addLabelIds,
        removeLabelIds: args.removeLabelIds,
      });

      const lines: string[] = [];
      if (result.addedLabelIds.length === 0 && result.removedLabelIds.length === 0) {
        lines.push("No label changes (requested labels were already in their target state).");
      } else {
        lines.push("User labels updated.");
        if (result.addedLabelIds.length > 0) {
          lines.push(`Added: ${result.addedLabelIds.join(", ")}`);
        }

        if (result.removedLabelIds.length > 0) {
          lines.push(`Removed: ${result.removedLabelIds.join(", ")}`);
        }
      }

      lines.push(`Message ID: ${result.id}`);
      lines.push(`Thread ID: ${result.threadId}`);
      lines.push(`Current labels: ${result.labelIds.length > 0 ? result.labelIds.join(", ") : "(none)"}`);
      return textToolResult(lines);
    } catch (error) {
      return getErrorToolResult(error, "Failed to update Gmail message user labels.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: UPDATE_GMAIL_MESSAGE_USER_LABELS_TOOL_NAME,
    description:
      "Add and/or remove user-defined labels on a Gmail message. User labels are folders/tags created by the user (e.g. 'Work/Clients/Acme').",
    inputSchema,
    handler,
  };

  return config;
}
