import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const UPDATE_GMAIL_MESSAGE_STATE_TOOL_NAME = "update_gmail_message_state";

export function getUpdateGmailMessageStateToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    messageId: z.string().describe("Gmail message ID (from list_gmail_messages or get_gmail_thread results)."),
    isRead: z
      .boolean()
      .optional()
      .describe("true = mark read; false = mark unread. Omit to leave the read state unchanged."),
    isArchived: z
      .boolean()
      .optional()
      .describe(
        "true = archive (remove from Inbox); false = move back to Inbox. Omit to leave the archive state unchanged."
      ),
    isStarred: z.boolean().optional().describe("true = star; false = unstar. Omit to leave the star state unchanged."),
    isImportant: z
      .boolean()
      .optional()
      .describe(
        "true = mark important; false = clear important. Omit to leave the importance unchanged. Note: Gmail's own classifier may also adjust this label automatically."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.updateGmailMessageState({
        messageId: args.messageId,
        isRead: args.isRead,
        isArchived: args.isArchived,
        isStarred: args.isStarred,
        isImportant: args.isImportant,
      });
      return textToolResult([
        "Message state updated.",
        `Message ID: ${result.id}`,
        `Thread ID: ${result.threadId}`,
        `read=${result.isRead}, archived=${result.isArchived}, starred=${result.isStarred}, important=${result.isImportant}`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to update Gmail message state.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: UPDATE_GMAIL_MESSAGE_STATE_TOOL_NAME,
    description:
      "Update Gmail message state flags: read/unread, archived/inbox, starred, important. Each flag is optional - only the flags you set are applied.",
    inputSchema,
    handler,
  };

  return config;
}
