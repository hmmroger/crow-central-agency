import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGmailMessageSummary } from "./gmail-format-utils.js";

export const GET_GMAIL_THREAD_TOOL_NAME = "get_gmail_thread";

export function getGetGmailThreadToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    threadId: z.string().describe("Gmail thread ID (from list_gmail_messages results' 'Thread' field)."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ threadId }) => {
    try {
      const thread = await googleClient.getGmailThread(threadId);
      const headerLines = [
        `Thread ID: ${thread.id}`,
        `Messages: ${thread.messages.length}`,
        "[Tip: Bodies are not included. Call get_gmail_message_content with a message ID below to read its full body.]",
      ];
      const messageBlocks = thread.messages.map(
        (message, index) => `=== MESSAGE ${index + 1} ===\n${formatGmailMessageSummary(message)}`
      );
      return textToolResult([...headerLines, "", ...messageBlocks]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to get Gmail thread.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_GMAIL_THREAD_TOOL_NAME,
    description:
      "Fetch a Gmail thread (conversation) by ID, returning metadata for every message - headers (from/to/cc/subject/date), labels, snippet - but no message bodies. Use this to map the conversation; then call get_gmail_message_content with specific message IDs to read the bodies that matter.",
    inputSchema,
    handler,
  };

  return config;
}
