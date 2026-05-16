import { z } from "zod";
import { DEFAULT_GMAIL_DRAFTS_LIST_LIMIT, type GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGmailDraftSummary } from "./gmail-format-utils.js";

const MAX_GMAIL_DRAFTS_LIMIT = 100;

export const LIST_GMAIL_DRAFTS_TOOL_NAME = "list_gmail_drafts";

export function getListGmailDraftsToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    limit: z
      .number()
      .int()
      .positive()
      .max(MAX_GMAIL_DRAFTS_LIMIT)
      .optional()
      .describe(
        `Number of drafts to return per page (default: ${DEFAULT_GMAIL_DRAFTS_LIST_LIMIT}, max: ${MAX_GMAIL_DRAFTS_LIMIT}).`
      ),
    pageToken: z
      .string()
      .optional()
      .describe("Token from a previous response's nextPageToken. Expires after a few hours."),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.listGmailDrafts({
        limit: args.limit ?? DEFAULT_GMAIL_DRAFTS_LIST_LIMIT,
        pageToken: args.pageToken,
      });
      if (result.drafts.length === 0) {
        return textToolResult(["No drafts found."]);
      }

      const headerLines = [
        "--- GMAIL DRAFTS ---",
        `[Showing: ${result.drafts.length} | Estimated total: ${result.resultSizeEstimate}]`,
      ];

      if (result.nextPageToken) {
        headerLines.push(`[More available: pass pageToken="${result.nextPageToken}" for next page]`);
      }

      const formatted = result.drafts.map(formatGmailDraftSummary).join("\n---\n");
      return textToolResult([...headerLines, "", formatted]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to list Gmail drafts.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_GMAIL_DRAFTS_TOOL_NAME,
    description:
      "List Gmail drafts. Returns draft IDs with message summaries (no body); use get_gmail_message_content for full body.",
    inputSchema,
    handler,
  };

  return config;
}
