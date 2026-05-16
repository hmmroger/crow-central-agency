import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const SEND_GMAIL_DRAFT_TOOL_NAME = "send_gmail_draft";

export function getSendGmailDraftToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    draftId: z.string().describe("Draft ID."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ draftId }) => {
    try {
      const result = await googleClient.sendGmailDraft({ draftId });
      return textToolResult(["Draft sent.", `Message ID: ${result.id}`, `Thread ID: ${result.threadId}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to send Gmail draft.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: SEND_GMAIL_DRAFT_TOOL_NAME,
    description: "Send an existing Gmail draft.",
    inputSchema,
    handler,
  };

  return config;
}
