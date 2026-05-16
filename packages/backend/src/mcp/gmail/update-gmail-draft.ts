import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const UPDATE_GMAIL_DRAFT_TOOL_NAME = "update_gmail_draft";

export function getUpdateGmailDraftToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    draftId: z.string().describe("Draft ID."),
    to: z.array(z.string()).optional().describe("Replaces recipients; preserved if omitted."),
    cc: z.array(z.string()).optional().describe("Replaces Cc; preserved if omitted."),
    bcc: z.array(z.string()).optional().describe("Replaces Bcc; preserved if omitted."),
    subject: z.string().optional().describe("Replaces subject; preserved if omitted."),
    body: z.string().optional().describe("Markdown. Replaces body; preserved if omitted."),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.updateGmailDraft({
        draftId: args.draftId,
        to: args.to,
        cc: args.cc,
        bcc: args.bcc,
        subject: args.subject,
        body: args.body,
      });
      return textToolResult([
        "Draft updated.",
        `Draft ID: ${result.id}`,
        `Message ID: ${result.messageId}`,
        `Thread ID: ${result.threadId}`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to update Gmail draft.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: UPDATE_GMAIL_DRAFT_TOOL_NAME,
    description:
      "Revise a Gmail draft. Unspecified fields are preserved (including reply threading). At least one of to/cc/bcc/subject/body required.",
    inputSchema,
    handler,
  };

  return config;
}
