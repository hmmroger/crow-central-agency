import { z } from "zod";
import { DEFAULT_GMAIL_LIST_LIMIT, type GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGmailMessageSummary } from "./gmail-format-utils.js";

const MAX_GMAIL_MESSAGES_LIMIT = 100;

export const LIST_GMAIL_MESSAGES_TOOL_NAME = "list_gmail_messages";

export function getListGmailMessagesToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    from: z.string().optional().describe("Match messages from this sender (email or name fragment)."),
    newerThanDays: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Messages received within the last N days. Use this for natural ranges like 'this week' (7) or 'this month' (30)."
      ),
    afterDateTime: z
      .string()
      .optional()
      .describe(
        "Inclusive lower bound in datetime format (e.g. 2025-04-05T14:30:00)\nFor 'today' queries late at night, the user typically still means the prior calendar day until they sleep - pass the prior subjective-day boundary, not literal midnight."
      ),
    beforeDateTime: z
      .string()
      .optional()
      .describe("Exclusive upper bound in datetime format (e.g. 2025-04-05T14:30:00)"),
    isUnread: z.boolean().optional().describe("Only unread messages."),
    contains: z
      .string()
      .optional()
      .describe("Free-text search across subject and body. Use for keyword/topic matches."),
    labelIds: z
      .array(z.string())
      .optional()
      .describe(
        'Filter by Gmail label IDs (e.g. ["INBOX", "UNREAD", "STARRED"]). Messages must match all listed labels.'
      ),
    limit: z
      .number()
      .int()
      .positive()
      .max(MAX_GMAIL_MESSAGES_LIMIT)
      .optional()
      .describe(
        `Number of messages to return per page (default: ${DEFAULT_GMAIL_LIST_LIMIT}, max: ${MAX_GMAIL_MESSAGES_LIMIT}).`
      ),
    pageToken: z
      .string()
      .optional()
      .describe(
        "Token from a previous response's nextPageToken to fetch the next page. Tokens expire after a few hours; rerun the query if expired."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.listGmailMessages({
        from: args.from,
        contains: args.contains,
        isUnread: args.isUnread,
        newerThanDays: args.newerThanDays,
        afterDateTime: args.afterDateTime,
        beforeDateTime: args.beforeDateTime,
        labelIds: args.labelIds,
        limit: args.limit ?? DEFAULT_GMAIL_LIST_LIMIT,
        pageToken: args.pageToken,
      });
      if (result.messages.length === 0) {
        return textToolResult(["No messages found."]);
      }

      const headerLines = [
        "--- GMAIL MESSAGES ---",
        `[Showing: ${result.messages.length} | Estimated total: ${result.resultSizeEstimate}]`,
      ];

      if (result.nextPageToken) {
        headerLines.push(`[More available: pass pageToken="${result.nextPageToken}" for next page]`);
      }

      const formatted = result.messages.map(formatGmailMessageSummary).join("\n---\n");
      return textToolResult([...headerLines, "", formatted]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to list Gmail messages.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_GMAIL_MESSAGES_TOOL_NAME,
    description:
      "List Gmail messages for the connected Google account, with structured filters. Returns each message's ID, thread ID, sender, recipients, subject, date, labels, and snippet - no body. Use get_gmail_message_content to read a specific message's body.",
    inputSchema,
    handler,
  };

  return config;
}
