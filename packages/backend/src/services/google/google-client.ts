import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { RequestError } from "../../core/error/request-error.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { markdownToHtml } from "../../utils/markdown-to-html.js";
import {
  parseGmailFullMessage,
  parseGmailLabel,
  parseGmailMessageSummary,
  parseReplyParentHeaders,
} from "./gmail-message-parser.js";
import type {
  GmailLabelsListResponse,
  GmailMessageRef,
  GmailMessagesListResponse,
  GmailRawLabel,
  GmailRawMessage,
  GmailRawThread,
  ReplyParentHeaders,
} from "./gmail-message-parser.types.js";
import { buildMimeMessage, encodeRawForGmail, formatFromHeader } from "./gmail-mime-builder.js";
import { buildGmailListQuery } from "./gmail-query-builder.js";
import {
  buildReferencesChain,
  deriveReplySubject,
  extractEmailAddress,
  splitAddressList,
} from "./gmail-reply-utils.js";
import { assertUserLabelIds, buildStateLabelDiff, deriveStateFromLabelIds } from "./gmail-label-utils.js";
import {
  GMAIL_LIST_METADATA_HEADERS,
  GMAIL_REPLY_METADATA_HEADERS,
  GMAIL_LABEL_COLOR_PALETTE,
  GOOGLE_SERVICE_NAME,
  type CreateGmailUserLabelOptions,
  type GmailLabel,
  type GmailMessage,
  type GmailMessageSummary,
  type GmailThread,
  type ListGmailLabelsResult,
  type ListGmailMessagesOptions,
  type ListGmailMessagesResult,
  type MoveGmailMessageToTrashResult,
  type ReplyToGmailMessageOptions,
  type SendGmailMessageOptions,
  type SendGmailMessageResult,
  type UpdateGmailMessageStateOptions,
  type UpdateGmailMessageStateResult,
  type UpdateGmailMessageUserLabelsOptions,
  type UpdateGmailMessageUserLabelsResult,
} from "./google-client.types.js";
import { buildGoogleUrl, safeReadGoogleError } from "./google-request.js";
import type { GoogleRequestOptions } from "./google-request.types.js";

const GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_THREADS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
const GMAIL_LABELS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/labels";
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

  public async listGmailLabels(): Promise<ListGmailLabelsResult> {
    const response = await this.request<GmailLabelsListResponse>({ url: GMAIL_LABELS_URL });
    const labels = (response.labels ?? []).map(parseGmailLabel);
    return { labels };
  }

  public async createGmailUserLabel(options: CreateGmailUserLabelOptions): Promise<GmailLabel> {
    const body =
      options.color === undefined
        ? { name: options.name }
        : { name: options.name, color: GMAIL_LABEL_COLOR_PALETTE[options.color] };
    const response = await this.request<GmailRawLabel>({
      url: GMAIL_LABELS_URL,
      method: "POST",
      body,
    });
    return parseGmailLabel(response);
  }

  public async deleteGmailUserLabel(labelId: string): Promise<void> {
    assertUserLabelIds([labelId], "labelId");
    await this.requestVoid({
      url: `${GMAIL_LABELS_URL}/${encodeURIComponent(labelId)}`,
      method: "DELETE",
    });
  }

  public async updateGmailMessageUserLabels(
    options: UpdateGmailMessageUserLabelsOptions
  ): Promise<UpdateGmailMessageUserLabelsResult> {
    assertUserLabelIds(options.addLabelIds, "addLabelIds");
    assertUserLabelIds(options.removeLabelIds, "removeLabelIds");
    return this.applyGmailMessageLabelDiff(options.messageId, options.addLabelIds ?? [], options.removeLabelIds ?? []);
  }

  public async updateGmailMessageState(
    options: UpdateGmailMessageStateOptions
  ): Promise<UpdateGmailMessageStateResult> {
    const diff = buildStateLabelDiff(options);
    const result = await this.applyGmailMessageLabelDiff(options.messageId, diff.addLabelIds, diff.removeLabelIds);
    return {
      id: result.id,
      threadId: result.threadId,
      ...deriveStateFromLabelIds(result.labelIds),
    };
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

  /**
   * Read the message's current labels, filter the requested add/remove arrays
   * against them (drop already-present additions and absent removals), and
   * issue messages.modify only when the filtered diff is non-empty. Shared
   * by the user-labels and state tools.
   */
  private async applyGmailMessageLabelDiff(
    messageId: string,
    requestedAdds: string[],
    requestedRemoves: string[]
  ): Promise<UpdateGmailMessageUserLabelsResult> {
    const current = await this.request<GmailRawMessage>({
      url: `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}`,
      query: { format: "minimal" },
    });
    const currentLabelIds = current.labelIds ?? [];
    const currentSet = new Set(currentLabelIds);
    const addedLabelIds = requestedAdds.filter((id) => !currentSet.has(id));
    const removedLabelIds = requestedRemoves.filter((id) => currentSet.has(id));

    if (addedLabelIds.length === 0 && removedLabelIds.length === 0) {
      return {
        id: current.id,
        threadId: current.threadId,
        labelIds: currentLabelIds,
        addedLabelIds,
        removedLabelIds,
      };
    }

    const response = await this.request<GmailRawMessage>({
      url: `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}/modify`,
      method: "POST",
      body: { addLabelIds: addedLabelIds, removeLabelIds: removedLabelIds },
    });

    return {
      id: response.id,
      threadId: response.threadId,
      labelIds: response.labelIds ?? [],
      addedLabelIds,
      removedLabelIds,
    };
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
    const response = await this.requestRaw(options);
    const jsonResponse = (await response.json()) as T | null;
    if (jsonResponse === null) {
      throw new RequestError(
        "Google API returned an empty response body.",
        response.status,
        undefined,
        GOOGLE_SERVICE_NAME
      );
    }

    return jsonResponse;
  }

  /** For endpoints that return 204 No Content (e.g. DELETE label). */
  private async requestVoid(options: GoogleRequestOptions): Promise<void> {
    await this.requestRaw(options);
  }

  private async requestRaw(options: GoogleRequestOptions): Promise<Response> {
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

    return response;
  }
}
