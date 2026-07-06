import { z } from "zod";
import { RequestError } from "../../core/error/request-error.js";
import type { GoogleClient } from "../../services/google/google-client.js";
import { EMAIL_BODY_FORMAT, GOOGLE_SERVICE_NAME } from "../../services/google/google-client.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const CREATE_GMAIL_DRAFT_TOOL_NAME = "create_gmail_draft";

export function getCreateGmailDraftToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    parentMessageId: z
      .string()
      .optional()
      .describe("Reply mode: ID of the message the draft replies to. Omit for a new (non-reply) draft."),
    replyAll: z
      .boolean()
      .optional()
      .describe(
        "Reply mode only: when true, address the draft to every other recipient on the parent. Ignored without parentMessageId."
      ),
    to: z
      .array(z.string())
      .optional()
      .describe(
        'New-draft mode: recipient email addresses. Required without parentMessageId. Each entry is "user@domain.com" or "Display Name <user@domain.com>".'
      ),
    cc: z.array(z.string()).optional().describe("New-draft mode: optional Cc recipients."),
    bcc: z.array(z.string()).optional().describe("New-draft mode: optional Bcc recipients."),
    subject: z.string().optional().describe("New-draft mode: subject line. Required without parentMessageId."),
    body: z.string().min(1).describe('Draft body. Defaults to markdown; pass raw HTML when bodyFormat is "html".'),
    bodyFormat: z
      .enum([EMAIL_BODY_FORMAT.MARKDOWN, EMAIL_BODY_FORMAT.HTML])
      .optional()
      .describe('Body format. Defaults to "markdown"; set to "html" to supply raw HTML.'),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      if (args.parentMessageId !== undefined) {
        const result = await googleClient.createGmailReplyDraft({
          parentMessageId: args.parentMessageId,
          body: args.body,
          bodyFormat: args.bodyFormat,
          replyAll: args.replyAll,
        });
        return textToolResult([
          "Reply draft created.",
          `Draft ID: ${result.id}`,
          `Message ID: ${result.messageId}`,
          `Thread ID: ${result.threadId}`,
        ]);
      }

      if (args.to === undefined || args.to.length === 0 || args.subject === undefined || args.subject.length === 0) {
        throw new RequestError(
          "create_gmail_draft requires 'to' and 'subject' when parentMessageId is not provided.",
          undefined,
          undefined,
          GOOGLE_SERVICE_NAME
        );
      }

      const result = await googleClient.createGmailDraft({
        to: args.to,
        cc: args.cc,
        bcc: args.bcc,
        subject: args.subject,
        body: args.body,
        bodyFormat: args.bodyFormat,
      });
      return textToolResult([
        "Draft created.",
        `Draft ID: ${result.id}`,
        `Message ID: ${result.messageId}`,
        `Thread ID: ${result.threadId}`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to create Gmail draft.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: CREATE_GMAIL_DRAFT_TOOL_NAME,
    description:
      'Create a draft email in the Drafts folder. Two modes: new draft or reply draft (parentMessageId required, recipients/subject/threading derived from parent, replyAll optional). Body defaults to markdown; set bodyFormat to "html" to supply raw HTML.',
    inputSchema,
    handler,
  };

  return config;
}
