export const GOOGLE_SERVICE_NAME = "google";

export const GMAIL_HEADER = {
  FROM: "From",
  TO: "To",
  CC: "Cc",
  BCC: "Bcc",
  SUBJECT: "Subject",
  DATE: "Date",
  MESSAGE_ID: "Message-ID",
  REPLY_TO: "Reply-To",
  REFERENCES: "References",
  IN_REPLY_TO: "In-Reply-To",
} as const;

export const EMAIL_BODY_FORMAT = {
  MARKDOWN: "markdown",
  HTML: "html",
} as const;

export type EmailBodyFormat = (typeof EMAIL_BODY_FORMAT)[keyof typeof EMAIL_BODY_FORMAT];

export const GMAIL_LIST_METADATA_HEADERS = [
  GMAIL_HEADER.FROM,
  GMAIL_HEADER.TO,
  GMAIL_HEADER.CC,
  GMAIL_HEADER.BCC,
  GMAIL_HEADER.SUBJECT,
  GMAIL_HEADER.DATE,
];

export const GMAIL_REPLY_METADATA_HEADERS = [
  GMAIL_HEADER.MESSAGE_ID,
  GMAIL_HEADER.FROM,
  GMAIL_HEADER.REPLY_TO,
  GMAIL_HEADER.TO,
  GMAIL_HEADER.CC,
  GMAIL_HEADER.SUBJECT,
  GMAIL_HEADER.REFERENCES,
];

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  date?: string;
  receivedTimestamp?: number;
  labelIds: string[];
  snippet?: string;
}

export interface GmailMessage extends GmailMessageSummary {
  content?: string;
}

export interface GmailThread {
  id: string;
  historyId?: string;
  messages: GmailMessageSummary[];
}

export interface ListGmailMessagesOptions {
  /** Match messages from this sender (email or name fragment). */
  from?: string;
  /** Match messages sent to this recipient. */
  to?: string;
  /** Subject contains this text. */
  subjectContains?: string;
  /** Free-text match across subject + body. */
  contains?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
  /** ISO datetime in user's local time, e.g. "2025-05-06T14:30:00". */
  afterDateTime?: string;
  /** ISO datetime in user's local time. */
  beforeDateTime?: string;
  /** Messages received within the last N days. */
  newerThanDays?: number;
  labelIds?: string[];
  limit?: number;
  pageToken?: string;
}

export interface ListGmailMessagesResult {
  messages: GmailMessageSummary[];
  resultSizeEstimate: number;
  nextPageToken?: string;
}

export interface SendGmailMessageOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Body content (markdown by default; HTML when bodyFormat is "html"). */
  body: string;
  /** Body format; defaults to markdown. Use "html" to supply raw HTML. */
  bodyFormat?: EmailBodyFormat;
}

export interface SendGmailMessageResult {
  id: string;
  threadId: string;
}

export interface ReplyToGmailMessageOptions {
  /** ID of the message being replied to. */
  parentMessageId: string;
  /** Body content (markdown by default; HTML when bodyFormat is "html"). */
  body: string;
  /** Body format; defaults to markdown. Use "html" to supply raw HTML. */
  bodyFormat?: EmailBodyFormat;
  replyAll?: boolean;
}

export interface MoveGmailMessageToTrashResult {
  id: string;
  threadId: string;
}

export interface GmailDraftSummary {
  id: string;
  message: GmailMessageSummary;
}

export interface GmailDraft {
  id: string;
  message: GmailMessage;
}

export interface CreateGmailDraftOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Body content (markdown by default; HTML when bodyFormat is "html"). */
  body: string;
  /** Body format; defaults to markdown. Use "html" to supply raw HTML. */
  bodyFormat?: EmailBodyFormat;
}

export interface CreateGmailReplyDraftOptions {
  /** ID of the message the draft is a reply to. Recipients, subject, and threading headers are derived from this parent. */
  parentMessageId: string;
  /** Body content (markdown by default; HTML when bodyFormat is "html"). */
  body: string;
  /** Body format; defaults to markdown. Use "html" to supply raw HTML. */
  bodyFormat?: EmailBodyFormat;
  /** When true, the draft is addressed to every other recipient on the parent (To + Cc, excluding the connected account). */
  replyAll?: boolean;
}

export interface UpdateGmailDraftOptions {
  draftId: string;
  /** When provided, replaces the existing recipients. Otherwise preserved from the existing draft. */
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  /** Body content (markdown by default; HTML when bodyFormat is "html"). Replaces body; preserved if omitted. */
  body?: string;
  /** Body format for `body`; defaults to markdown. Use "html" to supply raw HTML. */
  bodyFormat?: EmailBodyFormat;
}

export interface SendGmailDraftOptions {
  draftId: string;
}

export interface ListGmailDraftsOptions {
  limit?: number;
  pageToken?: string;
}

export interface ListGmailDraftsResult {
  drafts: GmailDraftSummary[];
  resultSizeEstimate: number;
  nextPageToken?: string;
}

export interface GetGmailDraftOptions {
  draftId: string;
}

export interface DeleteGmailDraftOptions {
  draftId: string;
}

export interface GmailDraftMutationResult {
  /** Draft resource ID (use this for update / send / delete). */
  id: string;
  /** Underlying Gmail message ID inside the draft. */
  messageId: string;
  /** Thread the draft belongs to. */
  threadId: string;
}

export const GMAIL_LABEL_TYPE = {
  SYSTEM: "system",
  USER: "user",
} as const;

export type GmailLabelType = (typeof GMAIL_LABEL_TYPE)[keyof typeof GMAIL_LABEL_TYPE];

export interface GmailLabel {
  id: string;
  name: string;
  type: GmailLabelType;
}

export interface ListGmailLabelsResult {
  labels: GmailLabel[];
}

/**
 * Named colors agents can pick when creating a label. Each maps to a
 * curated (textColor, backgroundColor) pair from Gmail's allowed label
 * palette - keeps agents from having to know specific hex codes.
 */
export const GMAIL_LABEL_COLOR = {
  RED: "red",
  ORANGE: "orange",
  YELLOW: "yellow",
  GREEN: "green",
  TEAL: "teal",
  BLUE: "blue",
  PURPLE: "purple",
  PINK: "pink",
  GRAY: "gray",
} as const;

export type GmailLabelColor = (typeof GMAIL_LABEL_COLOR)[keyof typeof GMAIL_LABEL_COLOR];

export interface GmailLabelColorHex {
  textColor: string;
  backgroundColor: string;
}

export const GMAIL_LABEL_COLOR_PALETTE: Record<GmailLabelColor, GmailLabelColorHex> = {
  [GMAIL_LABEL_COLOR.RED]: { textColor: "#ffffff", backgroundColor: "#cc3a21" },
  [GMAIL_LABEL_COLOR.ORANGE]: { textColor: "#ffffff", backgroundColor: "#ffad47" },
  [GMAIL_LABEL_COLOR.YELLOW]: { textColor: "#000000", backgroundColor: "#fad165" },
  [GMAIL_LABEL_COLOR.GREEN]: { textColor: "#ffffff", backgroundColor: "#16a766" },
  [GMAIL_LABEL_COLOR.TEAL]: { textColor: "#ffffff", backgroundColor: "#43d692" },
  [GMAIL_LABEL_COLOR.BLUE]: { textColor: "#ffffff", backgroundColor: "#4a86e8" },
  [GMAIL_LABEL_COLOR.PURPLE]: { textColor: "#ffffff", backgroundColor: "#a479e2" },
  [GMAIL_LABEL_COLOR.PINK]: { textColor: "#ffffff", backgroundColor: "#f691b3" },
  [GMAIL_LABEL_COLOR.GRAY]: { textColor: "#000000", backgroundColor: "#cccccc" },
};

export interface CreateGmailUserLabelOptions {
  name: string;
  /** Optional named color from `GMAIL_LABEL_COLOR`. Maps to a (textColor, backgroundColor) pair Gmail accepts. */
  color?: GmailLabelColor;
}

export interface UpdateGmailMessageUserLabelsOptions {
  messageId: string;
  /** User label IDs to attach. Already-present labels are silently skipped. System labels are rejected. */
  addLabelIds?: string[];
  /** User label IDs to detach. Labels not currently on the message are silently skipped. System labels are rejected. */
  removeLabelIds?: string[];
}

export interface UpdateGmailMessageUserLabelsResult {
  id: string;
  threadId: string;
  /** Final label IDs on the message after the update. */
  labelIds: string[];
  /** Labels actually added (input filtered to those that weren't already present). */
  addedLabelIds: string[];
  /** Labels actually removed (input filtered to those that were present). */
  removedLabelIds: string[];
}

export interface GmailMessageState {
  /** true = read (UNREAD label absent); false = unread (UNREAD label present). */
  isRead: boolean;
  /** true = archived (INBOX label absent); false = in Inbox (INBOX label present). */
  isArchived: boolean;
  /** true = starred (STARRED label present); false = not starred. */
  isStarred: boolean;
  /** true = marked important (IMPORTANT label present); false = not important. */
  isImportant: boolean;
}

export interface UpdateGmailMessageStateOptions extends Partial<GmailMessageState> {
  messageId: string;
}

export interface UpdateGmailMessageStateResult extends GmailMessageState {
  id: string;
  threadId: string;
}

export const GOOGLE_CALENDAR_ACCESS_ROLE = {
  OWNER: "owner",
  WRITER: "writer",
  READER: "reader",
  FREE_BUSY_READER: "freeBusyReader",
} as const;

export type GoogleCalendarAccessRole = (typeof GOOGLE_CALENDAR_ACCESS_ROLE)[keyof typeof GOOGLE_CALENDAR_ACCESS_ROLE];

export interface GoogleCalendar {
  id: string;
  /** Display name. For the primary calendar this is the user's email. */
  summary: string;
  /** User-provided description; absent for most calendars. */
  description?: string;
  /** Present and true on the user's primary calendar. */
  primary?: boolean;
  /** Access level the caller has on this calendar. */
  accessRole: GoogleCalendarAccessRole;
  /** IANA timezone of the calendar (e.g. "America/Los_Angeles"). */
  timeZone: string;
}

export interface ListGoogleCalendarsOptions {
  /** Max calendars to return. Defaults to `DEFAULT_GOOGLE_CALENDAR_LIST_LIMIT`. */
  limit?: number;
}

export interface ListGoogleCalendarsResult {
  calendars: GoogleCalendar[];
}

export const DEFAULT_GOOGLE_CALENDAR_ID = "primary";

export const GOOGLE_CALENDAR_EVENT_STATUS = {
  CONFIRMED: "confirmed",
  TENTATIVE: "tentative",
  CANCELLED: "cancelled",
} as const;

export type GoogleCalendarEventStatus =
  (typeof GOOGLE_CALENDAR_EVENT_STATUS)[keyof typeof GOOGLE_CALENDAR_EVENT_STATUS];

export const GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE = {
  NEEDS_ACTION: "needsAction",
  DECLINED: "declined",
  TENTATIVE: "tentative",
  ACCEPTED: "accepted",
} as const;

export type GoogleCalendarEventAttendeeResponse =
  (typeof GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE)[keyof typeof GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE];

export const GOOGLE_CALENDAR_EVENT_TYPE = {
  DEFAULT: "default",
  OUT_OF_OFFICE: "outOfOffice",
  FOCUS_TIME: "focusTime",
  WORKING_LOCATION: "workingLocation",
  BIRTHDAY: "birthday",
  FROM_GMAIL: "fromGmail",
} as const;

export type GoogleCalendarEventType = (typeof GOOGLE_CALENDAR_EVENT_TYPE)[keyof typeof GOOGLE_CALENDAR_EVENT_TYPE];

export interface GoogleCalendarEventTime {
  /** Original RFC3339 timestamp ("2025-05-10T14:30:00-07:00") or YYYY-MM-DD for all-day events. */
  raw: string;
  /** Human-readable representation in the user's timezone (or the raw date for all-day events). */
  display: string;
  /** true when this is an all-day event (date only, no time). */
  isAllDay: boolean;
  /** IANA timezone the event was scheduled in, if specified. */
  timeZone?: string;
}

export interface GoogleCalendarEventAttendee {
  email: string;
  displayName?: string;
  responseStatus: GoogleCalendarEventAttendeeResponse;
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
}

export interface GoogleCalendarEventSummary {
  id: string;
  status: GoogleCalendarEventStatus;
  eventType: GoogleCalendarEventType;
  summary?: string;
  start: GoogleCalendarEventTime;
  end: GoogleCalendarEventTime;
  location?: string;
  /** true when this event is an instance of a recurring series (has recurringEventId). */
  isRecurringInstance: boolean;
  organizerEmail?: string;
  htmlLink?: string;
  attendeeCount: number;
}

export interface GoogleCalendarEvent extends GoogleCalendarEventSummary {
  description?: string;
  attendees?: GoogleCalendarEventAttendee[];
  hangoutLink?: string;
  /** Present when this event is an instance of a recurring series. */
  recurringEventId?: string;
}

export interface ListGoogleCalendarEventsOptions {
  /** Calendar to query; defaults to the user's primary calendar. */
  calendarId?: string;
  /** Inclusive lower bound. ISO datetime in user's local time (or with offset). Defaults to "now". */
  startDateTime?: string;
  /** Exclusive upper bound. ISO datetime in user's local time (or with offset). */
  endDateTime?: string;
  /** Free-text query matched across summary/description/location/attendees. */
  contains?: string;
  limit?: number;
  pageToken?: string;
}

export interface ListGoogleCalendarEventsResult {
  events: GoogleCalendarEventSummary[];
  nextPageToken?: string;
}

export interface GetGoogleCalendarEventOptions {
  /** Calendar to read from; defaults to the user's primary calendar. */
  calendarId?: string;
  eventId: string;
}

export interface CreateGoogleCalendarEventOptions {
  /** Calendar to create the event on; defaults to the user's primary calendar. */
  calendarId?: string;
  /** Event title (mapped to Google's `summary` field). */
  title: string;
  /**
   * Inclusive start. For timed events pass an ISO datetime (e.g. "2025-05-10T14:00:00")
   * interpreted in the user's local timezone if no offset is present. For all-day events
   * pass a date-only string ("YYYY-MM-DD").
   */
  startDateTime: string;
  /**
   * Inclusive end. Same format rules as startDateTime. For all-day events pass the LAST
   * day of the event (inclusive) - the client converts to Google's exclusive-end format
   * internally.
   */
  endDateTime: string;
  /** Markdown body; converted to HTML before sending. */
  description?: string;
  location?: string;
  /** Email addresses of attendees. When non-empty, Google sends invitation emails. */
  attendees?: string[];
  /** When true, request a Google Meet conference; the response's hangoutLink will carry the URL. */
  addMeetLink?: boolean;
}

/** Wire body shape for events.insert. */
export interface GoogleCalendarEventInsertBody {
  summary: string;
  description?: string;
  location?: string;
  start: GoogleRawCalendarEventTime;
  end: GoogleRawCalendarEventTime;
  attendees?: { email: string }[];
  conferenceData?: GoogleRawCalendarEventConferenceData;
}

export interface UpdateGoogleCalendarEventOptions {
  /** Calendar the event lives on; defaults to the user's primary calendar. */
  calendarId?: string;
  eventId: string;
  /** Event title. */
  title?: string;
  /**
   * Inclusive start. Must be provided together with endDateTime and use the same format
   * (both date-only YYYY-MM-DD for all-day events, or both ISO datetimes for timed).
   */
  startDateTime?: string;
  /**
   * Inclusive end. For all-day events, pass the LAST day (inclusive); the client converts
   * to Google's exclusive-end format internally.
   */
  endDateTime?: string;
  /** Markdown body; converted to HTML before sending. */
  description?: string;
  location?: string;
  /** Email addresses to invite. Already-present attendees are silently skipped. */
  addAttendees?: string[];
  /** Email addresses to detach. Emails not currently on the event are silently skipped. */
  removeAttendees?: string[];
}

export interface DeleteGoogleCalendarEventOptions {
  /** Calendar the event lives on; defaults to the user's primary calendar. */
  calendarId?: string;
  eventId: string;
}

export interface GoogleRawCalendarEventTime {
  /** Present for all-day events (YYYY-MM-DD). */
  date?: string;
  /** Present for timed events (RFC3339). */
  dateTime?: string;
  /** IANA timezone the event creator picked. */
  timeZone?: string;
}

export interface GoogleRawCalendarEventPerson {
  email?: string;
  displayName?: string;
  self?: boolean;
}

export interface GoogleRawCalendarEventAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
}

export const GOOGLE_CONFERENCE_SOLUTION_TYPE = {
  EVENT_HANGOUT: "eventHangout", // deprecated
  EVENT_NAME_HANGOUT: "eventNamedHangout", // deprecated
  HANGOUTS_MEET: "hangoutsMeet",
  ADD_ON: "addOn",
} as const;

export type GoogleConferenceSolutionType =
  (typeof GOOGLE_CONFERENCE_SOLUTION_TYPE)[keyof typeof GOOGLE_CONFERENCE_SOLUTION_TYPE];

export interface GoogleRawConferenceSolutionKey {
  type: string;
}

export interface GoogleRawConferenceCreateRequest {
  requestId: string;
  conferenceSolutionKey: GoogleRawConferenceSolutionKey;
  status?: { statusCode?: string };
}

export interface GoogleRawConferenceEntryPoint {
  entryPointType?: string;
  uri?: string;
  label?: string;
  pin?: string;
  accessCode?: string;
  meetingCode?: string;
  passcode?: string;
  password?: string;
}

export interface GoogleRawConferenceSolution {
  key?: GoogleRawConferenceSolutionKey;
  name?: string;
  iconUri?: string;
}

export interface GoogleRawCalendarEventConferenceData {
  /** Stable conference ID Google assigns after createRequest succeeds. */
  conferenceId?: string;
  /** Populated when asking Google to create a conference (insert request) and echoed back on the response. */
  createRequest?: GoogleRawConferenceCreateRequest;
  /** Phone/video/sip entry points the conference exposes. */
  entryPoints?: GoogleRawConferenceEntryPoint[];
  /** The conference solution (e.g. Google Meet) the conference belongs to. */
  conferenceSolution?: GoogleRawConferenceSolution;
}

export interface GoogleRawCalendarEvent {
  id: string;
  status?: string;
  eventType?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  organizer?: GoogleRawCalendarEventPerson;
  start: GoogleRawCalendarEventTime;
  end: GoogleRawCalendarEventTime;
  recurringEventId?: string;
  conferenceData?: GoogleRawCalendarEventConferenceData;
  attendees?: GoogleRawCalendarEventAttendee[];
  hangoutLink?: string;
}

export interface GoogleCalendarEventsListResponse {
  items?: GoogleRawCalendarEvent[];
  nextPageToken?: string;
}

/** Raw item shape from Google Calendar v3 `calendarList.list`. */
export interface GoogleRawCalendarListEntry {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: string;
  timeZone: string;
}

export interface GoogleCalendarListResponse {
  items?: GoogleRawCalendarListEntry[];
  nextPageToken?: string;
}

export interface GoogleContactEmail {
  value: string;
  /** "home", "work", "other", or a custom label. */
  type?: string;
}

export interface GoogleContactPhone {
  value: string;
  /** "home", "mobile", "work", or a custom label. */
  type?: string;
}

export interface GoogleContactOrganization {
  name?: string;
  title?: string;
  department?: string;
}

export interface GoogleContact {
  /** Stable People-API identifier (e.g. "people/c123..."). */
  resourceName: string;
  /** Primary display name when Google supplied one. */
  displayName?: string;
  givenName?: string;
  familyName?: string;
  emails: GoogleContactEmail[];
  phones: GoogleContactPhone[];
  organizations: GoogleContactOrganization[];
}

export interface SearchGoogleContactsOptions {
  /** Free-text fragment matched server-side against name, email, phone, and organization. */
  query: string;
  /** Max results to return (1-30). Defaults to 10 - the People API's own default. */
  limit?: number;
}

export interface SearchGoogleContactsResult {
  contacts: GoogleContact[];
}

export interface GoogleRawContactName {
  displayName?: string;
  displayNameLastFirst?: string;
  givenName?: string;
  familyName?: string;
  middleName?: string;
  honorificPrefix?: string;
  honorificSuffix?: string;
}

export interface GoogleRawContactEmail {
  value?: string;
  type?: string;
  formattedType?: string;
  displayName?: string;
}

export interface GoogleRawContactPhone {
  value?: string;
  type?: string;
  canonicalForm?: string;
  formattedType?: string;
}

export interface GoogleRawContactOrganization {
  type?: string;
  formattedType?: string;
  name?: string;
  current?: boolean;
  title?: string;
  department?: string;
  jobDescription?: string;
  domain?: string;
  location?: string;
}

export interface GoogleRawContactPerson {
  resourceName: string;
  names?: GoogleRawContactName[];
  emailAddresses?: GoogleRawContactEmail[];
  phoneNumbers?: GoogleRawContactPhone[];
  organizations?: GoogleRawContactOrganization[];
}

export interface GoogleSearchContactsResponse {
  results?: { person?: GoogleRawContactPerson }[];
}
