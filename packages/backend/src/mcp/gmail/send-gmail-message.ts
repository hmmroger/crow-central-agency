import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const SEND_GMAIL_MESSAGE_TOOL_NAME = "send_gmail_message";

export function getSendGmailMessageToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    to: z
      .array(z.string())
      .min(1)
      .describe('Recipient email addresses. Each entry is "user@domain.com" or "Display Name <user@domain.com>".'),
    cc: z.array(z.string()).optional().describe("Optional Cc recipients (same address format as 'to')."),
    bcc: z.array(z.string()).optional().describe("Optional Bcc recipients (same address format as 'to')."),
    subject: z.string().min(1).describe("Email subject line."),
    body: z
      .string()
      .min(1)
      .describe(
        "Email body in markdown. Recipients will receive both a plain-text version (the markdown source) and an HTML version (rendered)."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.sendGmailMessage({
        to: args.to,
        cc: args.cc,
        bcc: args.bcc,
        subject: args.subject,
        body: args.body,
      });
      return textToolResult(["Message sent.", `Message ID: ${result.id}`, `Thread ID: ${result.threadId}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to send Gmail message.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: SEND_GMAIL_MESSAGE_TOOL_NAME,
    description:
      "Send a new email via the connected Google account. Body is provided as markdown and delivered as multipart/alternative (text/plain + text/html). For replies, use reply_to_gmail_message instead so threading headers are set correctly.",
    inputSchema,
    handler,
  };

  return config;
}
