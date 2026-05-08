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
