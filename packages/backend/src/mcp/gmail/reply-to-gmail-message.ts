import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const REPLY_TO_GMAIL_MESSAGE_TOOL_NAME = "reply_to_gmail_message";

export function getReplyToGmailMessageToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    messageId: z
      .string()
      .describe(
        "ID of the message being replied to (from list_gmail_messages or get_gmail_thread). Recipients, subject, and threading headers are derived from this parent."
      ),
    body: z
      .string()
      .min(1)
      .describe(
        "Reply body in markdown. Recipients will receive both a plain-text version (the markdown source) and an HTML version (rendered)."
      ),
    replyAll: z
      .boolean()
      .optional()
      .describe(
        "When true, also reply to every other recipient on the parent message (To and Cc, excluding the connected account). Default: false (reply only to the original sender)."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.replyToGmailMessage({
        parentMessageId: args.messageId,
        body: args.body,
        replyAll: args.replyAll,
      });
      return textToolResult(["Reply sent.", `Message ID: ${result.id}`, `Thread ID: ${result.threadId}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to reply to Gmail message.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: REPLY_TO_GMAIL_MESSAGE_TOOL_NAME,
    description:
      "Reply to a Gmail message by ID. Recipients (To/Cc), subject (Re: prefix), and threading headers (In-Reply-To, References, threadId) are all derived from the parent - you only supply the body and an optional replyAll flag. Body is markdown; sent as multipart/alternative.",
    inputSchema,
    handler,
  };

  return config;
}
