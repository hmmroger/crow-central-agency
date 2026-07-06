import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { RequestError } from "../../core/error/request-error.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { parseDateTimeWithTimezone } from "../../utils/date-utils.js";
import { generateId } from "../../utils/id-utils.js";
import { markdownToHtml } from "../../utils/markdown-to-html.js";
import { parseGoogleCalendarEventFull, parseGoogleCalendarEventSummary } from "./google-calendar-event-parser.js";
import { parseGoogleContact } from "./google-contact-parser.js";
import {
  parseGmailDraftFull,
  parseGmailDraftSummary,
  parseGmailFullMessage,
  parseGmailFullMessageWithBodyParts,
  parseGmailLabel,
  parseGmailMessageSummary,
  parseReplyParentHeaders,
  findHeader,
} from "./gmail-message-parser.js";
import type {
  GmailDraftsListResponse,
  GmailLabelsListResponse,
  GmailMessageRef,
  GmailMessagesListResponse,
  GmailRawDraft,
  GmailRawLabel,
  GmailRawMessage,
  GmailRawThread,
  ReplyParentHeaders,
} from "./gmail-message-parser.types.js";
import { buildMimeMessage, encodeRawForGmail, formatFromHeader } from "./gmail-mime-builder.js";
import { buildGmailListQuery } from "./gmail-query-builder.js";
import { resolveEmailBodyParts } from "./resolve-email-body-parts.js";
import {
  buildReferencesChain,
  deriveReplySubject,
  extractEmailAddress,
  splitAddressList,
} from "./gmail-reply-utils.js";
import { assertUserLabelIds, buildStateLabelDiff, deriveStateFromLabelIds } from "./gmail-label-utils.js";
import {
  DEFAULT_GOOGLE_CALENDAR_ID,
  GMAIL_HEADER,
  GMAIL_LIST_METADATA_HEADERS,
  GMAIL_REPLY_METADATA_HEADERS,
  GMAIL_LABEL_COLOR_PALETTE,
  GOOGLE_CALENDAR_ACCESS_ROLE,
  GOOGLE_SERVICE_NAME,
  GOOGLE_CONFERENCE_SOLUTION_TYPE,
  EMAIL_BODY_FORMAT,
  type EmailBodyFormat,
  type CreateGmailDraftOptions,
  type CreateGmailReplyDraftOptions,
  type CreateGmailUserLabelOptions,
  type CreateGoogleCalendarEventOptions,
  type DeleteGmailDraftOptions,
  type DeleteGoogleCalendarEventOptions,
  type GetGmailDraftOptions,
  type GetGoogleCalendarEventOptions,
  type GmailDraft,
  type GmailDraftMutationResult,
  type GmailDraftSummary,
  type GoogleCalendarEventInsertBody,
  type GmailLabel,
  type GmailMessage,
  type GmailMessageSummary,
  type GmailThread,
  type GoogleCalendar,
  type GoogleCalendarAccessRole,
  type GoogleCalendarEvent,
  type GoogleCalendarEventsListResponse,
  type GoogleCalendarListResponse,
  type GoogleRawCalendarEvent,
  type GoogleRawCalendarEventAttendee,
  type GoogleRawCalendarListEntry,
  type ListGmailDraftsOptions,
  type ListGmailDraftsResult,
  type ListGmailLabelsResult,
  type ListGoogleCalendarEventsOptions,
  type ListGoogleCalendarEventsResult,
  type ListGmailMessagesOptions,
  type ListGmailMessagesResult,
  type ListGoogleCalendarsOptions,
  type ListGoogleCalendarsResult,
  type MoveGmailMessageToTrashResult,
  type SearchGoogleContactsOptions,
  type SearchGoogleContactsResult,
  type SendGmailDraftOptions,
  type GoogleRawContactPerson,
  type GoogleSearchContactsResponse,
  type UpdateGmailDraftOptions,
  type UpdateGoogleCalendarEventOptions,
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
const GMAIL_DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const GOOGLE_CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const GOOGLE_CALENDAR_EVENTS_BASE_URL = "https://www.googleapis.com/calendar/v3/calendars";
const GOOGLE_PEOPLE_SEARCH_URL = "https://people.googleapis.com/v1/people:searchContacts";
const GOOGLE_CONTACTS_READ_MASK = "names,emailAddresses,phoneNumbers,organizations";
const GOOGLE_CONTACTS_WARMUP_TTL_MS = 25 * 60 * 1000;
export const DEFAULT_GMAIL_LIST_LIMIT = 25;
export const DEFAULT_GMAIL_DRAFTS_LIST_LIMIT = 25;
export const DEFAULT_GOOGLE_CALENDAR_LIST_LIMIT = 50;
export const DEFAULT_GOOGLE_CALENDAR_EVENTS_LIST_LIMIT = 25;
export const DEFAULT_GOOGLE_CONTACTS_SEARCH_LIMIT = 10;
const GOOGLE_CALENDAR_LIST_MAX_PAGE_SIZE = 250;
const GOOGLE_CALENDAR_EVENTS_MAX_PAGE_SIZE = 2500;
export const GOOGLE_CONTACTS_SEARCH_MAX_PAGE_SIZE = 30;

const ALL_DAY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function calendarEventsUrl(calendarId: string): string {
  return `${GOOGLE_CALENDAR_EVENTS_BASE_URL}/${encodeURIComponent(calendarId)}/events`;
}

function isAllDayDate(value: string): boolean {
  return ALL_DAY_DATE_PATTERN.test(value.trim());
}

/** Add one calendar day to a YYYY-MM-DD string. Used to convert an inclusive end-date to Google's exclusive-end convention. */
function bumpDateByOneDay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function toCalendarApiRfc3339(dateTimeStr: string, userTimezone: string, fieldName: string): string {
  const epochMs = parseDateTimeWithTimezone(dateTimeStr, userTimezone);
  if (!Number.isFinite(epochMs)) {
    throw new RequestError(`Invalid ${fieldName}: ${dateTimeStr}`, undefined, undefined, GOOGLE_SERVICE_NAME);
  }

  return new Date(epochMs).toISOString();
}

function isCalendarAccessRole(value: string): value is GoogleCalendarAccessRole {
  return (
    value === GOOGLE_CALENDAR_ACCESS_ROLE.OWNER ||
    value === GOOGLE_CALENDAR_ACCESS_ROLE.WRITER ||
    value === GOOGLE_CALENDAR_ACCESS_ROLE.READER ||
    value === GOOGLE_CALENDAR_ACCESS_ROLE.FREE_BUSY_READER
  );
}

function parseGoogleCalendar(raw: GoogleRawCalendarListEntry): GoogleCalendar {
  // Defensively fall back to the lowest-privilege role if Google ever
  // introduces a new value we don't yet model.
  const accessRole = isCalendarAccessRole(raw.accessRole)
    ? raw.accessRole
    : GOOGLE_CALENDAR_ACCESS_ROLE.FREE_BUSY_READER;
  const calendar: GoogleCalendar = {
    id: raw.id,
    summary: raw.summary,
    accessRole,
    timeZone: raw.timeZone,
  };
  if (raw.description !== undefined) {
    calendar.description = raw.description;
  }

  if (raw.primary === true) {
    calendar.primary = true;
  }

  return calendar;
}

/**
 * Per-agent runtime client for Google REST APIs (Gmail, Calendar, Contacts...).
 * Bound to one agent at construction; owns auth, transport, error unwrapping,
 * and the agent's user-timezone-aware datetime conversions.
 */
export class GoogleClient {
  /**
   * Last successful `people:searchContacts` warmup timestamp. Google's contacts
   * search hits a server-side cache that needs to be hydrated per identity
   * before queries return useful results; we lazily warm it on the first
   * search and re-warm once `GOOGLE_CONTACTS_WARMUP_TTL_MS` has elapsed.
   */
  private contactsWarmupAt = 0;
  private contactsWarmupInFlight: Promise<void> | undefined;

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
    const raw = await this.buildOutboundRawForNew({
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      body: options.body,
      format: options.bodyFormat ?? EMAIL_BODY_FORMAT.MARKDOWN,
    });
    return this.sendRawMessage(raw);
  }

  public async moveGmailMessageToTrash(messageId: string): Promise<MoveGmailMessageToTrashResult> {
    const response = await this.request<GmailMessageRef>({
      url: `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}/trash`,
      method: "POST",
    });

    return { id: response.id, threadId: response.threadId };
  }

  public async listGoogleCalendars(options: ListGoogleCalendarsOptions = {}): Promise<ListGoogleCalendarsResult> {
    const limit = options.limit ?? DEFAULT_GOOGLE_CALENDAR_LIST_LIMIT;
    const calendars: GoogleCalendar[] = [];
    let pageToken: string | undefined;
    while (calendars.length < limit) {
      const remaining = limit - calendars.length;
      const pageSize = Math.min(remaining, GOOGLE_CALENDAR_LIST_MAX_PAGE_SIZE);
      const page = await this.request<GoogleCalendarListResponse>({
        url: GOOGLE_CALENDAR_LIST_URL,
        query: { pageToken, maxResults: String(pageSize) },
      });
      for (const item of page.items ?? []) {
        if (calendars.length >= limit) {
          break;
        }

        calendars.push(parseGoogleCalendar(item));
      }

      if (page.nextPageToken === undefined) {
        break;
      }

      pageToken = page.nextPageToken;
    }

    return { calendars };
  }

  public async listGoogleCalendarEvents(
    options: ListGoogleCalendarEventsOptions = {}
  ): Promise<ListGoogleCalendarEventsResult> {
    const userTimezone = await this.sensorManager.getUserTimezone();
    const calendarId = options.calendarId ?? DEFAULT_GOOGLE_CALENDAR_ID;
    const limit = options.limit ?? DEFAULT_GOOGLE_CALENDAR_EVENTS_LIST_LIMIT;
    const pageSize = Math.min(limit, GOOGLE_CALENDAR_EVENTS_MAX_PAGE_SIZE);
    const timeMin =
      options.startDateTime !== undefined
        ? toCalendarApiRfc3339(options.startDateTime, userTimezone, "startDateTime")
        : new Date().toISOString();
    const timeMax =
      options.endDateTime !== undefined
        ? toCalendarApiRfc3339(options.endDateTime, userTimezone, "endDateTime")
        : undefined;

    const response = await this.request<GoogleCalendarEventsListResponse>({
      url: calendarEventsUrl(calendarId),
      query: {
        timeMin,
        timeMax,
        q: options.contains,
        maxResults: String(pageSize),
        // Expand recurring events into individual instances and order by start
        // time so listings read chronologically; the API requires singleEvents
        // for orderBy=startTime.
        singleEvents: "true",
        orderBy: "startTime",
        pageToken: options.pageToken,
      },
    });

    const events = (response.items ?? []).map((item) => parseGoogleCalendarEventSummary(item, userTimezone));
    const result: ListGoogleCalendarEventsResult = { events };
    if (response.nextPageToken !== undefined) {
      result.nextPageToken = response.nextPageToken;
    }

    return result;
  }

  public async getGoogleCalendarEvent(options: GetGoogleCalendarEventOptions): Promise<GoogleCalendarEvent> {
    const userTimezone = await this.sensorManager.getUserTimezone();
    const calendarId = options.calendarId ?? DEFAULT_GOOGLE_CALENDAR_ID;
    const raw = await this.request<GoogleRawCalendarEvent>({
      url: `${calendarEventsUrl(calendarId)}/${encodeURIComponent(options.eventId)}`,
    });

    return parseGoogleCalendarEventFull(raw, userTimezone);
  }

  public async createGoogleCalendarEvent(options: CreateGoogleCalendarEventOptions): Promise<GoogleCalendarEvent> {
    const userTimezone = await this.sensorManager.getUserTimezone();
    const calendarId = options.calendarId ?? DEFAULT_GOOGLE_CALENDAR_ID;
    const startIsAllDay = isAllDayDate(options.startDateTime);
    const endIsAllDay = isAllDayDate(options.endDateTime);
    if (startIsAllDay !== endIsAllDay) {
      throw new RequestError(
        "startDateTime and endDateTime must both be date-only (YYYY-MM-DD) or both be datetimes.",
        undefined,
        undefined,
        GOOGLE_SERVICE_NAME
      );
    }

    const body: GoogleCalendarEventInsertBody = {
      summary: options.title,
      start: startIsAllDay
        ? { date: options.startDateTime.trim() }
        : {
            dateTime: toCalendarApiRfc3339(options.startDateTime, userTimezone, "startDateTime"),
            timeZone: userTimezone,
          },
      end: endIsAllDay
        ? { date: bumpDateByOneDay(options.endDateTime.trim()) }
        : { dateTime: toCalendarApiRfc3339(options.endDateTime, userTimezone, "endDateTime"), timeZone: userTimezone },
    };
    if (options.description !== undefined && options.description.length > 0) {
      body.description = markdownToHtml(options.description);
    }

    if (options.location !== undefined && options.location.length > 0) {
      body.location = options.location;
    }

    if (options.attendees !== undefined && options.attendees.length > 0) {
      body.attendees = options.attendees.map((email) => ({ email }));
    }

    if (options.addMeetLink === true) {
      body.conferenceData = {
        createRequest: {
          requestId: generateId(),
          conferenceSolutionKey: { type: GOOGLE_CONFERENCE_SOLUTION_TYPE.HANGOUTS_MEET },
        },
      };
    }

    const query: Record<string, string> = {};
    if (body.attendees !== undefined) {
      query.sendUpdates = "all";
    }

    if (body.conferenceData !== undefined) {
      query.conferenceDataVersion = "1";
    }

    const raw = await this.request<GoogleRawCalendarEvent>({
      url: calendarEventsUrl(calendarId),
      method: "POST",
      query: Object.keys(query).length > 0 ? query : undefined,
      body,
    });

    return parseGoogleCalendarEventFull(raw, userTimezone);
  }

  public async updateGoogleCalendarEvent(options: UpdateGoogleCalendarEventOptions): Promise<GoogleCalendarEvent> {
    const userTimezone = await this.sensorManager.getUserTimezone();
    const calendarId = options.calendarId ?? DEFAULT_GOOGLE_CALENDAR_ID;
    const { startDateTime, endDateTime } = options;
    if ((startDateTime === undefined) !== (endDateTime === undefined)) {
      throw new RequestError(
        "startDateTime and endDateTime must be provided together.",
        undefined,
        undefined,
        GOOGLE_SERVICE_NAME
      );
    }

    const hasAnyChange =
      options.title !== undefined ||
      options.description !== undefined ||
      options.location !== undefined ||
      startDateTime !== undefined ||
      (options.addAttendees !== undefined && options.addAttendees.length > 0) ||
      (options.removeAttendees !== undefined && options.removeAttendees.length > 0);
    if (!hasAnyChange) {
      throw new RequestError(
        "updateGoogleCalendarEvent requires at least one field to change.",
        undefined,
        undefined,
        GOOGLE_SERVICE_NAME
      );
    }

    const eventUrl = `${calendarEventsUrl(calendarId)}/${encodeURIComponent(options.eventId)}`;
    const current = await this.request<GoogleRawCalendarEvent>({ url: eventUrl });
    const body: GoogleRawCalendarEvent = { ...current };
    if (options.title !== undefined) {
      body.summary = options.title;
    }

    if (options.description !== undefined) {
      body.description = options.description.length > 0 ? markdownToHtml(options.description) : "";
    }

    if (options.location !== undefined) {
      body.location = options.location;
    }

    if (startDateTime !== undefined && endDateTime !== undefined) {
      const startIsAllDay = isAllDayDate(startDateTime);
      const endIsAllDay = isAllDayDate(endDateTime);
      if (startIsAllDay !== endIsAllDay) {
        throw new RequestError(
          "startDateTime and endDateTime must both be date-only (YYYY-MM-DD) or both be datetimes.",
          undefined,
          undefined,
          GOOGLE_SERVICE_NAME
        );
      }

      body.start = startIsAllDay
        ? { date: startDateTime.trim() }
        : { dateTime: toCalendarApiRfc3339(startDateTime, userTimezone, "startDateTime"), timeZone: userTimezone };
      body.end = endIsAllDay
        ? { date: bumpDateByOneDay(endDateTime.trim()) }
        : { dateTime: toCalendarApiRfc3339(endDateTime, userTimezone, "endDateTime"), timeZone: userTimezone };
    }

    const hasAttendeeChange =
      (options.addAttendees !== undefined && options.addAttendees.length > 0) ||
      (options.removeAttendees !== undefined && options.removeAttendees.length > 0);
    if (hasAttendeeChange) {
      const attendeesMap = new Map<string, GoogleRawCalendarEventAttendee>();
      for (const existingAttendee of current.attendees ?? []) {
        attendeesMap.set(existingAttendee.email.toLowerCase(), existingAttendee);
      }

      for (const emailToRemove of options.removeAttendees ?? []) {
        attendeesMap.delete(emailToRemove.toLowerCase());
      }

      for (const emailToAdd of options.addAttendees ?? []) {
        const key = emailToAdd.toLowerCase();
        if (!attendeesMap.has(key)) {
          attendeesMap.set(key, { email: emailToAdd });
        }
      }

      body.attendees = Array.from(attendeesMap.values());
    }

    const query: Record<string, string> = { sendUpdates: "all" };
    if (body.conferenceData !== undefined) {
      query.conferenceDataVersion = "1";
    }

    const raw = await this.request<GoogleRawCalendarEvent>({
      url: eventUrl,
      method: "PUT",
      query,
      body,
    });

    return parseGoogleCalendarEventFull(raw, userTimezone);
  }

  public async deleteGoogleCalendarEvent(options: DeleteGoogleCalendarEventOptions): Promise<void> {
    const calendarId = options.calendarId ?? DEFAULT_GOOGLE_CALENDAR_ID;
    await this.requestVoid({
      url: `${calendarEventsUrl(calendarId)}/${encodeURIComponent(options.eventId)}`,
      method: "DELETE",
      query: { sendUpdates: "all" },
    });
  }

  public async searchGoogleContacts(options: SearchGoogleContactsOptions): Promise<SearchGoogleContactsResult> {
    await this.ensureContactsCacheWarm();
    const limit = options.limit ?? DEFAULT_GOOGLE_CONTACTS_SEARCH_LIMIT;
    const pageSize = Math.min(limit, GOOGLE_CONTACTS_SEARCH_MAX_PAGE_SIZE);
    const response = await this.request<GoogleSearchContactsResponse>({
      url: GOOGLE_PEOPLE_SEARCH_URL,
      query: {
        query: options.query,
        readMask: GOOGLE_CONTACTS_READ_MASK,
        pageSize: String(pageSize),
      },
    });
    const contacts = (response.results ?? [])
      .map((entry) => entry.person)
      .filter((person): person is GoogleRawContactPerson => person !== undefined)
      .map(parseGoogleContact);
    return { contacts };
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
    const { raw, threadId } = await this.buildOutboundRawForReply(
      options.parentMessageId,
      options.body,
      options.bodyFormat ?? EMAIL_BODY_FORMAT.MARKDOWN,
      options.replyAll
    );
    return this.sendRawMessage(raw, threadId);
  }

  public async createGmailDraft(options: CreateGmailDraftOptions): Promise<GmailDraftMutationResult> {
    const raw = await this.buildOutboundRawForNew({
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      body: options.body,
      format: options.bodyFormat ?? EMAIL_BODY_FORMAT.MARKDOWN,
    });
    return this.persistDraft(raw);
  }

  public async createGmailReplyDraft(options: CreateGmailReplyDraftOptions): Promise<GmailDraftMutationResult> {
    const { raw, threadId } = await this.buildOutboundRawForReply(
      options.parentMessageId,
      options.body,
      options.bodyFormat ?? EMAIL_BODY_FORMAT.MARKDOWN,
      options.replyAll
    );
    return this.persistDraft(raw, threadId);
  }

  public async sendGmailDraft(options: SendGmailDraftOptions): Promise<SendGmailMessageResult> {
    const response = await this.request<GmailMessageRef>({
      url: `${GMAIL_DRAFTS_URL}/send`,
      method: "POST",
      body: { id: options.draftId },
    });
    return { id: response.id, threadId: response.threadId };
  }

  public async updateGmailDraft(options: UpdateGmailDraftOptions): Promise<GmailDraftMutationResult> {
    const hasAnyChange =
      options.to !== undefined ||
      options.cc !== undefined ||
      options.bcc !== undefined ||
      options.subject !== undefined ||
      options.body !== undefined;
    if (!hasAnyChange) {
      throw new RequestError(
        "updateGmailDraft requires at least one field to change.",
        undefined,
        undefined,
        GOOGLE_SERVICE_NAME
      );
    }

    const userTimezone = await this.sensorManager.getUserTimezone();
    const draftUrl = `${GMAIL_DRAFTS_URL}/${encodeURIComponent(options.draftId)}`;
    const existing = await this.request<GmailRawDraft>({ url: draftUrl, query: { format: "full" } });
    const { message: existingMessage, extractedBody } = parseGmailFullMessageWithBodyParts(
      existing.message,
      userTimezone
    );
    const existingHeaders = existing.message.payload?.headers ?? [];
    const inReplyTo = findHeader(existingHeaders, GMAIL_HEADER.IN_REPLY_TO);
    const referencesHeader = findHeader(existingHeaders, GMAIL_HEADER.REFERENCES);
    const references =
      referencesHeader === undefined ? undefined : referencesHeader.split(/\s+/).filter((entry) => entry.length > 0);

    const to = options.to ?? splitAddressList(existingMessage.to);
    const ccList = options.cc ?? splitAddressList(existingMessage.cc);
    const bccList = options.bcc ?? splitAddressList(existingMessage.bcc);
    const subject = options.subject ?? existingMessage.subject ?? "";
    const bodyParts =
      options.body !== undefined
        ? resolveEmailBodyParts(options.body, options.bodyFormat ?? EMAIL_BODY_FORMAT.MARKDOWN)
        : undefined;
    const plainText = bodyParts?.plainText ?? extractedBody.bodyText ?? "";
    const html = bodyParts?.html ?? extractedBody.bodyHtml ?? "";

    const profile = await this.connectorManager.getProfile(this.agentId, CONNECTOR_ID.GOOGLE);
    const rfc822 = buildMimeMessage({
      from: formatFromHeader(profile.username, profile.displayName),
      to,
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: bccList.length > 0 ? bccList : undefined,
      subject,
      inReplyTo,
      references: references !== undefined && references.length > 0 ? references : undefined,
      plainText,
      html,
    });
    const raw = encodeRawForGmail(rfc822);

    const requestBody: { message: { raw: string; threadId?: string } } = { message: { raw } };
    if (existing.message.threadId !== undefined) {
      requestBody.message.threadId = existing.message.threadId;
    }

    const response = await this.request<GmailRawDraft>({
      url: draftUrl,
      method: "PUT",
      body: requestBody,
    });
    return this.toDraftMutationResult(response);
  }

  public async listGmailDrafts(options: ListGmailDraftsOptions = {}): Promise<ListGmailDraftsResult> {
    const limit = options.limit ?? DEFAULT_GMAIL_DRAFTS_LIST_LIMIT;
    const userTimezone = await this.sensorManager.getUserTimezone();
    const listResponse = await this.request<GmailDraftsListResponse>({
      url: GMAIL_DRAFTS_URL,
      query: {
        maxResults: String(limit),
        pageToken: options.pageToken,
      },
    });

    const refs = listResponse.drafts ?? [];
    const drafts = await Promise.all(refs.map((ref) => this.fetchGmailDraftSummary(ref.id, userTimezone)));
    const result: ListGmailDraftsResult = {
      drafts,
      resultSizeEstimate: listResponse.resultSizeEstimate,
    };
    if (listResponse.nextPageToken !== undefined) {
      result.nextPageToken = listResponse.nextPageToken;
    }

    return result;
  }

  public async getGmailDraft(options: GetGmailDraftOptions): Promise<GmailDraft> {
    const userTimezone = await this.sensorManager.getUserTimezone();
    const raw = await this.request<GmailRawDraft>({
      url: `${GMAIL_DRAFTS_URL}/${encodeURIComponent(options.draftId)}`,
      query: { format: "full" },
    });
    return parseGmailDraftFull(raw, userTimezone);
  }

  public async deleteGmailDraft(options: DeleteGmailDraftOptions): Promise<void> {
    await this.requestVoid({
      url: `${GMAIL_DRAFTS_URL}/${encodeURIComponent(options.draftId)}`,
      method: "DELETE",
    });
  }

  /**
   * Hydrate (or refresh) Google's per-identity contacts search cache.
   */
  private async ensureContactsCacheWarm(): Promise<void> {
    if (Date.now() - this.contactsWarmupAt < GOOGLE_CONTACTS_WARMUP_TTL_MS) {
      return;
    }

    if (this.contactsWarmupInFlight !== undefined) {
      await this.contactsWarmupInFlight;
      return;
    }

    this.contactsWarmupInFlight = this.runContactsWarmup();
    try {
      await this.contactsWarmupInFlight;
    } finally {
      this.contactsWarmupInFlight = undefined;
    }
  }

  private async runContactsWarmup(): Promise<void> {
    await this.request<GoogleSearchContactsResponse>({
      url: GOOGLE_PEOPLE_SEARCH_URL,
      query: {
        query: "",
        readMask: GOOGLE_CONTACTS_READ_MASK,
      },
    });
    this.contactsWarmupAt = Date.now();
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

  /** Build a base64url-encoded RFC 2822 message for a brand-new (non-reply) outbound message. */
  private async buildOutboundRawForNew(options: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    format: EmailBodyFormat;
  }): Promise<string> {
    const profile = await this.connectorManager.getProfile(this.agentId, CONNECTOR_ID.GOOGLE);
    const { plainText, html } = resolveEmailBodyParts(options.body, options.format);
    const rfc822 = buildMimeMessage({
      from: formatFromHeader(profile.username, profile.displayName),
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      plainText,
      html,
    });
    return encodeRawForGmail(rfc822);
  }

  /**
   * Build a base64url-encoded RFC 2822 reply: fetches the parent's headers,
   * derives recipients (Reply-To ?? From; replyAll → parent To+Cc minus self),
   * prefixes the subject with "Re: ", and threads via In-Reply-To + References.
   * Returns the encoded raw alongside the parent's threadId so callers can
   * attach it on send/draft operations.
   */
  private async buildOutboundRawForReply(
    parentMessageId: string,
    body: string,
    format: EmailBodyFormat,
    replyAll: boolean | undefined
  ): Promise<{ raw: string; threadId: string }> {
    const parent = await this.fetchReplyParentHeaders(parentMessageId);
    const primaryReplyAddress = parent.replyTo ?? parent.from;
    if (primaryReplyAddress === undefined) {
      throw new RequestError(
        `Cannot reply: parent message ${parentMessageId} has no From or Reply-To header.`,
        undefined,
        undefined,
        GOOGLE_SERVICE_NAME
      );
    }

    const profile = await this.connectorManager.getProfile(this.agentId, CONNECTOR_ID.GOOGLE);
    const selfEmail = profile.username.toLowerCase();
    const to: string[] = [primaryReplyAddress];
    const cc: string[] = [];
    if (replyAll === true) {
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

    const rfc822 = buildMimeMessage({
      from: formatFromHeader(profile.username, profile.displayName),
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject: deriveReplySubject(parent.subject),
      inReplyTo: parent.messageIdHeader,
      references: buildReferencesChain(parent.messageIdHeader, parent.references),
      ...resolveEmailBodyParts(body, format),
    });

    return { raw: encodeRawForGmail(rfc822), threadId: parent.threadId };
  }

  /** POST users.drafts.create with the prepared raw, optionally attaching threadId for reply drafts. */
  private async persistDraft(raw: string, threadId?: string): Promise<GmailDraftMutationResult> {
    const body: { message: { raw: string; threadId?: string } } = { message: { raw } };
    if (threadId !== undefined) {
      body.message.threadId = threadId;
    }

    const response = await this.request<GmailRawDraft>({
      url: GMAIL_DRAFTS_URL,
      method: "POST",
      body,
    });
    return this.toDraftMutationResult(response);
  }

  private toDraftMutationResult(raw: GmailRawDraft): GmailDraftMutationResult {
    return {
      id: raw.id,
      messageId: raw.message.id,
      threadId: raw.message.threadId,
    };
  }

  private async fetchGmailDraftSummary(draftId: string, userTimezone: string): Promise<GmailDraftSummary> {
    const raw = await this.request<GmailRawDraft>({
      url: `${GMAIL_DRAFTS_URL}/${encodeURIComponent(draftId)}`,
      query: {
        format: "metadata",
        metadataHeaders: GMAIL_LIST_METADATA_HEADERS,
      },
    });
    return parseGmailDraftSummary(raw, userTimezone);
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
