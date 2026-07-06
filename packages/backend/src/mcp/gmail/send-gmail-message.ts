import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import { EMAIL_BODY_FORMAT } from "../../services/google/google-client.types.js";
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
        'Email body. Defaults to markdown (rendered to HTML for recipients); pass raw HTML when bodyFormat is "html". Sent as multipart/alternative (text/plain + text/html).'
      ),
    bodyFormat: z
      .enum([EMAIL_BODY_FORMAT.MARKDOWN, EMAIL_BODY_FORMAT.HTML])
      .optional()
      .describe('Body format. Defaults to "markdown"; set to "html" to supply raw HTML.'),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.sendGmailMessage({
        to: args.to,
        cc: args.cc,
        bcc: args.bcc,
        subject: args.subject,
        body: args.body,
        bodyFormat: args.bodyFormat,
      });
      return textToolResult(["Message sent.", `Message ID: ${result.id}`, `Thread ID: ${result.threadId}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to send Gmail message.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: SEND_GMAIL_MESSAGE_TOOL_NAME,
    description:
      'Send a new email via the connected Google account. Body defaults to markdown; set bodyFormat to "html" to supply raw HTML. Delivered as multipart/alternative (text/plain + text/html). For replies, use reply_to_gmail_message instead so threading headers are set correctly.',
    inputSchema,
    handler,
  };

  return config;
}
