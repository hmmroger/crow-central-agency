import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const MOVE_GMAIL_MESSAGE_TO_TRASH_TOOL_NAME = "move_gmail_message_to_trash";

export function getMoveGmailMessageToTrashToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    messageId: z.string().describe("Gmail message ID (from list_gmail_messages or get_gmail_thread results)."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ messageId }) => {
    try {
      const result = await googleClient.moveGmailMessageToTrash(messageId);
      return textToolResult(["Moved to Trash.", `Message ID: ${result.id}`, `Thread ID: ${result.threadId}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to move Gmail message to Trash.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: MOVE_GMAIL_MESSAGE_TO_TRASH_TOOL_NAME,
    description:
      "Move a Gmail message to Trash. Recoverable: Gmail auto-purges Trash after ~30 days, but the user can restore it from the Trash folder before then.",
    inputSchema,
    handler,
  };

  return config;
}
