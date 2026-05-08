import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { RequestError } from "../../core/error/request-error.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { markdownToHtml } from "../../utils/markdown-to-html.js";
import {
  GMAIL_LIST_METADATA_HEADERS,
  GMAIL_REPLY_METADATA_HEADERS,
  parseGmailFullMessage,
  parseGmailMessageSummary,
  parseReplyParentHeaders,
  type GmailMessageRef,
  type GmailMessagesListResponse,
  type GmailRawMessage,
  type GmailRawThread,
  type ReplyParentHeaders,
} from "./gmail-message-parser.js";
import { buildMimeMessage, encodeRawForGmail, formatFromHeader } from "./gmail-mime-builder.js";
import { buildGmailListQuery } from "./gmail-query-builder.js";
import {
  buildReferencesChain,
  deriveReplySubject,
  extractEmailAddress,
  splitAddressList,
} from "./gmail-reply-utils.js";
import type {
  GmailMessage,
  GmailMessageSummary,
  GmailThread,
  ListGmailMessagesOptions,
  ListGmailMessagesResult,
  MoveGmailMessageToTrashResult,
  ReplyToGmailMessageOptions,
  SendGmailMessageOptions,
  SendGmailMessageResult,
} from "./google-client.types.js";
import {
  buildGoogleUrl,
  GOOGLE_SERVICE_NAME,
  safeReadGoogleError,
  type GoogleRequestOptions,
} from "./google-request.js";

const GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_THREADS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
export const DEFAULT_GMAIL_LIST_LIMIT = 25;

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
    const userTimezone = await this.sensorManager.getUserTimezone();
    const query = buildGmailListQuery(options, userTimezone);
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
    const messages = await Promise.all(refs.map((ref) => this.fetchGmailMessageSummary(ref.id, userTimezone)));
    return {
      messages,
      resultSizeEstimate: listResponse.resultSizeEstimate,
      nextPageToken: listResponse.nextPageToken,
    };
  }

  public async getGmailMessage(messageId: string): Promise<GmailMessage> {
    const userTimezone = await this.sensorManager.getUserTimezone();
    const raw = await this.request<GmailRawMessage>({
      url: `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}`,
      query: { format: "full" },
    });

    return parseGmailFullMessage(raw, userTimezone);
  }

  public async getGmailThread(threadId: string): Promise<GmailThread> {
    const userTimezone = await this.sensorManager.getUserTimezone();
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
      messages: (raw.messages ?? []).map((message) => parseGmailMessageSummary(message, userTimezone)),
    };
  }

  public async sendGmailMessage(options: SendGmailMessageOptions): Promise<SendGmailMessageResult> {
    const profile = await this.connectorManager.getProfile(this.agentId, CONNECTOR_ID.GOOGLE);
    const html = markdownToHtml(options.body);
    const rfc822 = buildMimeMessage({
      from: formatFromHeader(profile.username, profile.displayName),
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      plainText: options.body,
      html,
    });
    return this.sendRawMessage(encodeRawForGmail(rfc822));
  }

  public async moveGmailMessageToTrash(messageId: string): Promise<MoveGmailMessageToTrashResult> {
    const response = await this.request<GmailMessageRef>({
      url: `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}/trash`,
      method: "POST",
    });

    return { id: response.id, threadId: response.threadId };
  }

  public async replyToGmailMessage(options: ReplyToGmailMessageOptions): Promise<SendGmailMessageResult> {
    const parent = await this.fetchReplyParentHeaders(options.parentMessageId);
    const primaryReplyAddress = parent.replyTo ?? parent.from;
    if (primaryReplyAddress === undefined) {
      throw new RequestError(
        `Cannot reply: parent message ${options.parentMessageId} has no From or Reply-To header.`,
        undefined,
        undefined,
        GOOGLE_SERVICE_NAME
      );
    }

    const profile = await this.connectorManager.getProfile(this.agentId, CONNECTOR_ID.GOOGLE);
    const selfEmail = profile.username.toLowerCase();
    const to: string[] = [primaryReplyAddress];
    const cc: string[] = [];
    if (options.replyAll === true) {
      const primaryEmail = extractEmailAddress(primaryReplyAddress);
      for (const address of splitAddressList(parent.to)) {
        const email = extractEmailAddress(address);
        if (email !== selfEmail && email !== primaryEmail) {
          to.push(address);
        }
      }

      for (const address of splitAddressList(parent.cc)) {
        const email = extractEmailAddress(address);
        if (email !== selfEmail && email !== primaryEmail) {
          cc.push(address);
        }
      }
    }

    const html = markdownToHtml(options.body);
    const rfc822 = buildMimeMessage({
      from: formatFromHeader(profile.username, profile.displayName),
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject: deriveReplySubject(parent.subject),
      inReplyTo: parent.messageIdHeader,
      references: buildReferencesChain(parent.messageIdHeader, parent.references),
      plainText: options.body,
      html,
    });

    return this.sendRawMessage(encodeRawForGmail(rfc822), parent.threadId);
  }

  private async sendRawMessage(raw: string, threadId?: string): Promise<SendGmailMessageResult> {
    const body: { raw: string; threadId?: string } = { raw };
    if (threadId !== undefined) {
      body.threadId = threadId;
    }

    const response = await this.request<GmailMessageRef>({
      url: `${GMAIL_MESSAGES_URL}/send`,
      method: "POST",
      body,
    });

    return { id: response.id, threadId: response.threadId };
  }

  private async fetchReplyParentHeaders(messageId: string): Promise<ReplyParentHeaders> {
    const raw = await this.request<GmailRawMessage>({
      url: `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}`,
      query: {
        format: "metadata",
        metadataHeaders: GMAIL_REPLY_METADATA_HEADERS,
      },
    });

    return parseReplyParentHeaders(raw);
  }

  private async fetchGmailMessageSummary(messageId: string, userTimezone: string): Promise<GmailMessageSummary> {
    const raw = await this.request<GmailRawMessage>({
      url: `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}`,
      query: {
        format: "metadata",
        metadataHeaders: GMAIL_LIST_METADATA_HEADERS,
      },
    });

    return parseGmailMessageSummary(raw, userTimezone);
  }

  private async request<T>(options: GoogleRequestOptions): Promise<T> {
    const access = await this.connectorManager.getAccess(this.agentId, CONNECTOR_ID.GOOGLE);
    const url = buildGoogleUrl(options.url, options.query);

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
