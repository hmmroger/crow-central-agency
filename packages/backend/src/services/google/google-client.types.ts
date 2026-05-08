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
} as const;

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
  /** Markdown body */
  body: string;
}

export interface SendGmailMessageResult {
  id: string;
  threadId: string;
}

export interface ReplyToGmailMessageOptions {
  /** ID of the message being replied to. */
  parentMessageId: string;
  /** Markdown body */
  body: string;
  replyAll?: boolean;
}

export interface MoveGmailMessageToTrashResult {
  id: string;
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
