import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { RequestError } from "../../core/error/request-error.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { parseDateTimeWithTimezone } from "../../utils/date-utils.js";
import { htmlToMarkdown, plainTextToHtmlParagraphs } from "../../utils/html-to-markdown.js";
import type {
  GmailMessage,
  GmailMessageSummary,
  GmailThread,
  ListGmailMessagesOptions,
  ListGmailMessagesResult,
} from "./google-client.types.js";

const GOOGLE_SERVICE_NAME = "google";

const GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_THREADS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
const DEFAULT_GMAIL_LIST_LIMIT = 25;

const GMAIL_HEADER_FROM = "From";
const GMAIL_HEADER_TO = "To";
const GMAIL_HEADER_CC = "Cc";
const GMAIL_HEADER_BCC = "Bcc";
const GMAIL_HEADER_SUBJECT = "Subject";
const GMAIL_HEADER_DATE = "Date";
const GMAIL_LIST_METADATA_HEADERS = [
  GMAIL_HEADER_FROM,
  GMAIL_HEADER_TO,
  GMAIL_HEADER_CC,
  GMAIL_HEADER_BCC,
  GMAIL_HEADER_SUBJECT,
  GMAIL_HEADER_DATE,
];

const GMAIL_MIME_TEXT_PLAIN = "text/plain";
const GMAIL_MIME_TEXT_HTML = "text/html";

type GoogleRequestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface GoogleRequestOptions {
  url: string;
  method?: GoogleRequestMethod;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface GoogleErrorResponseBody {
  error?: { code?: number; message?: string; status?: string };
}

interface GmailMessageRef {
  id: string;
  threadId: string;
}

interface GmailMessagesListResponse {
  messages?: GmailMessageRef[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

interface GmailRawHeader {
  name: string;
  value: string;
}

interface GmailRawPayload {
  mimeType?: string;
  filename?: string;
  headers?: GmailRawHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailRawPayload[];
}

interface GmailRawMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailRawPayload;
}

interface GmailRawThread {
  id: string;
  historyId?: string;
  messages?: GmailRawMessage[];
}

/**
 * Per-agent runtime client for Google REST APIs (Gmail, Calendar, Contacts...).
 * Bound to one agent at construction; owns auth, transport, error unwrapping,
 * and the agent's user-timezone-aware datetime conversions.
 */
export class GoogleClient {
  constructor(
    private readonly connectorManager: ConnectorManager,
    private readonly sensorManager: SensorManager,
    private readonly agentId: string
  ) {}

  public async listGmailMessages(options: ListGmailMessagesOptions = {}): Promise<ListGmailMessagesResult> {
    const limit = options.limit ?? DEFAULT_GMAIL_LIST_LIMIT;
    const query = await this.buildGmailListQuery(options);
    const listResponse = await this.request<GmailMessagesListResponse>({
      url: GMAIL_MESSAGES_URL,
      query: {
        maxResults: String(limit),
        q: query.length > 0 ? query : undefined,
        pageToken: options.pageToken,
        labelIds: options.labelIds,
      },
    });

    const refs = listResponse.messages ?? [];
    const messages = await Promise.all(refs.map((ref) => this.fetchGmailMessageSummary(ref.id)));
    return {
      messages,
      resultSizeEstimate: listResponse.resultSizeEstimate,
      nextPageToken: listResponse.nextPageToken,
    };
  }

  public async getGmailMessage(messageId: string): Promise<GmailMessage> {
    const raw = await this.request<GmailRawMessage>({
      url: `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}`,
      query: { format: "full" },
    });

    return parseGmailFullMessage(raw);
  }

  public async getGmailThread(threadId: string): Promise<GmailThread> {
    const raw = await this.request<GmailRawThread>({
      url: `${GMAIL_THREADS_URL}/${encodeURIComponent(threadId)}`,
      query: {
        format: "metadata",
        metadataHeaders: GMAIL_LIST_METADATA_HEADERS,
      },
    });

    return {
      id: raw.id,
      historyId: raw.historyId,
      messages: (raw.messages ?? []).map(parseGmailMessageSummary),
    };
  }

  private async fetchGmailMessageSummary(messageId: string): Promise<GmailMessageSummary> {
    const raw = await this.request<GmailRawMessage>({
      url: `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}`,
      query: {
        format: "metadata",
        metadataHeaders: GMAIL_LIST_METADATA_HEADERS,
      },
    });

    return parseGmailMessageSummary(raw);
  }

  private async buildGmailListQuery(options: ListGmailMessagesOptions): Promise<string> {
    const parts: string[] = [];
    if (options.from) {
      parts.push(`from:${quoteGmailValue(options.from)}`);
    }

    if (options.to) {
      parts.push(`to:${quoteGmailValue(options.to)}`);
    }

    if (options.subjectContains) {
      parts.push(`subject:${quoteGmailValue(options.subjectContains)}`);
    }

    if (options.contains) {
      parts.push(quoteGmailValue(options.contains));
    }

    if (options.hasAttachment) {
      parts.push("has:attachment");
    }

    if (options.isUnread) {
      parts.push("is:unread");
    }

    if (options.isStarred) {
      parts.push("is:starred");
    }

    if (options.newerThanDays !== undefined) {
      parts.push(`newer_than:${options.newerThanDays}d`);
    }

    if (options.afterDateTime || options.beforeDateTime) {
      const userTimezone = await this.sensorManager.getUserTimezone();
      if (options.afterDateTime) {
        parts.push(`after:${toGmailEpochSeconds(options.afterDateTime, userTimezone, "afterDateTime")}`);
      }

      if (options.beforeDateTime) {
        parts.push(`before:${toGmailEpochSeconds(options.beforeDateTime, userTimezone, "beforeDateTime")}`);
      }
    }

    return parts.join(" ");
  }

  private async request<T>(options: GoogleRequestOptions): Promise<T> {
    const access = await this.connectorManager.getAccess(this.agentId, CONNECTOR_ID.GOOGLE);
    const url = buildUrl(options.url, options.query);

    const headers: Record<string, string> = { Authorization: `Bearer ${access.accessToken}` };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body,
      });
    } catch (error) {
      throw new RequestError("Google API request failed (network)", undefined, undefined, GOOGLE_SERVICE_NAME, {
        cause: error,
      });
    }

    if (!response.ok) {
      const errorBody = await safeReadGoogleError(response);
      const message = errorBody?.error?.message ?? `HTTP ${response.status}`;
      throw new RequestError(message, response.status, errorBody?.error?.status, GOOGLE_SERVICE_NAME);
    }

    return (await response.json()) as T;
  }
}

function parseGmailMessageSummary(raw: GmailRawMessage): GmailMessageSummary {
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
    date: findHeader(headers, GMAIL_HEADER_DATE),
  };
}

function parseGmailFullMessage(raw: GmailRawMessage): GmailMessage {
  const summary = parseGmailMessageSummary(raw);
  const body = extractBody(raw.payload);
  return { ...summary, content: renderMessageContent(body) };
}

interface ExtractedBody {
  bodyText?: string;
  bodyHtml?: string;
}

function extractBody(payload: GmailRawPayload | undefined): ExtractedBody {
  const result: ExtractedBody = {};
  if (payload) {
    walkPayloadParts(payload, result);
  }

  return result;
}

function walkPayloadParts(payload: GmailRawPayload, result: ExtractedBody): void {
  if (payload.filename && payload.body?.attachmentId) {
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

function toGmailEpochSeconds(dateTimeStr: string, userTimezone: string, fieldName: string): number {
  const epochMs = parseDateTimeWithTimezone(dateTimeStr, userTimezone);
  if (!Number.isFinite(epochMs)) {
    throw new RequestError(`Invalid ${fieldName}: ${dateTimeStr}`, undefined, undefined, GOOGLE_SERVICE_NAME);
  }

  return Math.floor(epochMs / 1000);
}

/**
 * Quote a Gmail q-operator value if it contains chars that would break parsing.
 * Bare values are fine for simple emails/names; quoted form handles spaces, special chars.
 */
function quoteGmailValue(value: string): string {
  if (/[\s"():&|]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return value;
}

function buildUrl(baseUrl: string, query: Record<string, string | string[] | undefined> | undefined): URL {
  const url = new URL(baseUrl);
  if (!query) {
    return url;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function findHeader(headers: GmailRawHeader[], name: string): string | undefined {
  const lowered = name.toLowerCase();
  return headers.find((header) => header.name.toLowerCase() === lowered)?.value;
}

async function safeReadGoogleError(response: Response): Promise<GoogleErrorResponseBody | undefined> {
  try {
    return (await response.json()) as GoogleErrorResponseBody;
  } catch {
    return undefined;
  }
}
