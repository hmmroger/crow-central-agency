import { formatLocalDateTime } from "../../utils/date-utils.js";
import { htmlToMarkdown, plainTextToHtmlParagraphs } from "../../utils/html-to-markdown.js";
import type { GmailMessage, GmailMessageSummary } from "./google-client.types.js";

export const GMAIL_HEADER_FROM = "From";
export const GMAIL_HEADER_TO = "To";
export const GMAIL_HEADER_CC = "Cc";
export const GMAIL_HEADER_BCC = "Bcc";
export const GMAIL_HEADER_SUBJECT = "Subject";
export const GMAIL_HEADER_DATE = "Date";
export const GMAIL_HEADER_MESSAGE_ID = "Message-ID";
export const GMAIL_HEADER_REPLY_TO = "Reply-To";
export const GMAIL_HEADER_REFERENCES = "References";

export const GMAIL_LIST_METADATA_HEADERS = [
  GMAIL_HEADER_FROM,
  GMAIL_HEADER_TO,
  GMAIL_HEADER_CC,
  GMAIL_HEADER_BCC,
  GMAIL_HEADER_SUBJECT,
  GMAIL_HEADER_DATE,
];

export const GMAIL_REPLY_METADATA_HEADERS = [
  GMAIL_HEADER_MESSAGE_ID,
  GMAIL_HEADER_FROM,
  GMAIL_HEADER_REPLY_TO,
  GMAIL_HEADER_TO,
  GMAIL_HEADER_CC,
  GMAIL_HEADER_SUBJECT,
  GMAIL_HEADER_REFERENCES,
];

const GMAIL_MIME_TEXT_PLAIN = "text/plain";
const GMAIL_MIME_TEXT_HTML = "text/html";

export interface GmailMessageRef {
  id: string;
  threadId: string;
}

export interface GmailMessagesListResponse {
  messages?: GmailMessageRef[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface GmailRawHeader {
  name: string;
  value: string;
}

export interface GmailRawPayload {
  mimeType?: string;
  filename?: string;
  headers?: GmailRawHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailRawPayload[];
}

export interface GmailRawMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailRawPayload;
}

export interface GmailRawThread {
  id: string;
  historyId?: string;
  messages?: GmailRawMessage[];
}

export interface ReplyParentHeaders {
  threadId: string;
  messageIdHeader?: string;
  from?: string;
  replyTo?: string;
  to?: string;
  cc?: string;
  subject?: string;
  references?: string;
}

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
    from: findHeader(headers, GMAIL_HEADER_FROM),
    to: findHeader(headers, GMAIL_HEADER_TO),
    cc: findHeader(headers, GMAIL_HEADER_CC),
    bcc: findHeader(headers, GMAIL_HEADER_BCC),
    subject: findHeader(headers, GMAIL_HEADER_SUBJECT),
    date: formatGmailDateHeader(findHeader(headers, GMAIL_HEADER_DATE), userTimezone),
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
    messageIdHeader: findHeader(headers, GMAIL_HEADER_MESSAGE_ID),
    from: findHeader(headers, GMAIL_HEADER_FROM),
    replyTo: findHeader(headers, GMAIL_HEADER_REPLY_TO),
    to: findHeader(headers, GMAIL_HEADER_TO),
    cc: findHeader(headers, GMAIL_HEADER_CC),
    subject: findHeader(headers, GMAIL_HEADER_SUBJECT),
    references: findHeader(headers, GMAIL_HEADER_REFERENCES),
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
