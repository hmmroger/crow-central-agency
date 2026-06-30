import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, processTextContent, textToolResult } from "../tool-utils.js";

export const GET_GMAIL_MESSAGE_CONTENT_TOOL_NAME = "get_gmail_message_content";

/** Default cap on lines returned for a Gmail message body to avoid flooding the context with long emails. */
export const DEFAULT_GMAIL_MESSAGE_CONTENT_LINE_LIMIT = 100;

export function getGetGmailMessageContentToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    messageId: z.string().describe("Gmail message ID (from list_gmail_messages or get_gmail_thread results)."),
    showLineNumber: z.boolean().optional().describe("Optional. Add line marker in the result."),
    startLine: z
      .number()
      .min(1)
      .optional()
      .describe("Optional. Starting line number (1-based) to begin reading from (default: 1)."),
    limit: z
      .number()
      .min(1)
      .optional()
      .describe(
        `Optional. Maximum number of lines to return starting from startLine (default: ${DEFAULT_GMAIL_MESSAGE_CONTENT_LINE_LIMIT}).`
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ messageId, showLineNumber, startLine, limit }) => {
    try {
      const message = await googleClient.getGmailMessage(messageId);
      const rawContent = message.content ?? message.snippet ?? "(no body)";
      const processed = processTextContent(rawContent, {
        showLineNumber,
        startLine,
        limit: limit ?? DEFAULT_GMAIL_MESSAGE_CONTENT_LINE_LIMIT,
      });
      return textToolResult([...processed.headerParts, "", processed.text]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to get Gmail message content.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_GMAIL_MESSAGE_CONTENT_TOOL_NAME,
    description:
      "Read the body content of a Gmail message by ID, rendered as markdown. Headers and metadata are not returned - call list_gmail_messages first for those. Supports line-range reading via startLine/limit/showLineNumber, useful for long messages.",
    inputSchema,
    handler,
  };

  return config;
}
