import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const DELETE_GMAIL_DRAFT_TOOL_NAME = "delete_gmail_draft";

export function getDeleteGmailDraftToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    draftId: z.string().describe("Draft ID."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ draftId }) => {
    try {
      await googleClient.deleteGmailDraft({ draftId });
      return textToolResult(["Draft deleted.", `Draft ID: ${draftId}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to delete Gmail draft.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: DELETE_GMAIL_DRAFT_TOOL_NAME,
    description: "Permanently delete a Gmail draft. Not recoverable (not moved to Trash).",
    inputSchema,
    handler,
  };

  return config;
}
