import { formatLocalDateTime } from "../../utils/date-utils.js";
import { htmlToMarkdown, plainTextToHtmlParagraphs } from "./email-html-to-markdown.js";
import type {
  GmailRawHeader,
  GmailRawLabel,
  GmailRawMessage,
  GmailRawPayload,
  ReplyParentHeaders,
} from "./gmail-message-parser.types.js";
import {
  GMAIL_HEADER,
  GMAIL_LABEL_TYPE,
  type GmailLabel,
  type GmailMessage,
  type GmailMessageSummary,
} from "./google-client.types.js";

const GMAIL_MIME_TEXT_PLAIN = "text/plain";
const GMAIL_MIME_TEXT_HTML = "text/html";

interface ExtractedBody {
  bodyText?: string;
  bodyHtml?: string;
}

export function parseGmailMessageSummary(raw: GmailRawMessage, userTimezone: string): GmailMessageSummary {
  const headers = raw.payload?.headers ?? [];
  return {
    id: raw.id,
    threadId: raw.threadId,
    labelIds: raw.labelIds ?? [],
    snippet: raw.snippet,
    receivedTimestamp: parseInternalDate(raw.internalDate),
    from: findHeader(headers, GMAIL_HEADER.FROM),
    to: findHeader(headers, GMAIL_HEADER.TO),
    cc: findHeader(headers, GMAIL_HEADER.CC),
    bcc: findHeader(headers, GMAIL_HEADER.BCC),
    subject: findHeader(headers, GMAIL_HEADER.SUBJECT),
    date: formatGmailDateHeader(findHeader(headers, GMAIL_HEADER.DATE), userTimezone),
  };
}

export function parseGmailFullMessage(raw: GmailRawMessage, userTimezone: string): GmailMessage {
  const summary = parseGmailMessageSummary(raw, userTimezone);
  const body = extractBody(raw.payload);
  return { ...summary, content: renderMessageContent(body) };
}

export function parseReplyParentHeaders(raw: GmailRawMessage): ReplyParentHeaders {
  const headers = raw.payload?.headers ?? [];
  return {
    threadId: raw.threadId,
    messageIdHeader: findHeader(headers, GMAIL_HEADER.MESSAGE_ID),
    from: findHeader(headers, GMAIL_HEADER.FROM),
    replyTo: findHeader(headers, GMAIL_HEADER.REPLY_TO),
    to: findHeader(headers, GMAIL_HEADER.TO),
    cc: findHeader(headers, GMAIL_HEADER.CC),
    subject: findHeader(headers, GMAIL_HEADER.SUBJECT),
    references: findHeader(headers, GMAIL_HEADER.REFERENCES),
  };
}

export function findHeader(headers: GmailRawHeader[], name: string): string | undefined {
  const lowered = name.toLowerCase();
  return headers.find((header) => header.name.toLowerCase() === lowered)?.value;
}

function extractBody(payload: GmailRawPayload | undefined): ExtractedBody {
  const result: ExtractedBody = {};
  if (payload) {
    walkPayloadParts(payload, result);
  }

  return result;
}

function walkPayloadParts(payload: GmailRawPayload, result: ExtractedBody): void {
  if (payload.body?.attachmentId) {
    return;
  }

  if (payload.body?.data) {
    if (payload.mimeType === GMAIL_MIME_TEXT_PLAIN && result.bodyText === undefined) {
      result.bodyText = decodeGmailBodyData(payload.body.data);
    } else if (payload.mimeType === GMAIL_MIME_TEXT_HTML && result.bodyHtml === undefined) {
      result.bodyHtml = decodeGmailBodyData(payload.body.data);
    }
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      walkPayloadParts(part, result);
    }
  }
}

/**
 * Render extracted body to a single markdown content string. HTML wins when
 * present (richer source); plain text is wrapped as paragraphs first so both
 * paths go through the same sanitize → markdown pipeline.
 */
function renderMessageContent(body: ExtractedBody): string | undefined {
  if (body.bodyHtml) {
    return htmlToMarkdown(body.bodyHtml);
  }

  if (body.bodyText) {
    return htmlToMarkdown(plainTextToHtmlParagraphs(body.bodyText));
  }

  return undefined;
}

/**
 * Render the sender-supplied RFC 2822 Date header in the user's local timezone.
 * The sender's mail client may have used any timezone (or had clock skew), so
 * we always normalize for consistent display. Falls back to undefined if the
 * header is missing or unparseable.
 */
function formatGmailDateHeader(rawDate: string | undefined, userTimezone: string): string | undefined {
  if (rawDate === undefined) {
    return undefined;
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return formatLocalDateTime(parsed, userTimezone);
}

/** Gmail's internalDate is epoch milliseconds as a string. */
function parseInternalDate(internalDate: string | undefined): number | undefined {
  if (internalDate === undefined) {
    return undefined;
  }

  const value = Number(internalDate);
  return Number.isFinite(value) ? value : undefined;
}

/** Gmail returns body bytes as base64url-encoded UTF-8. */
function decodeGmailBodyData(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf-8");
}

export function parseGmailLabel(raw: GmailRawLabel): GmailLabel {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type === GMAIL_LABEL_TYPE.SYSTEM ? GMAIL_LABEL_TYPE.SYSTEM : GMAIL_LABEL_TYPE.USER,
  };
}
