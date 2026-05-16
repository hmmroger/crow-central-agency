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

export interface GmailRawLabel {
  id: string;
  name: string;
  type?: string;
}

export interface GmailLabelsListResponse {
  labels?: GmailRawLabel[];
}

export interface GmailExtractedBody {
  bodyText?: string;
  bodyHtml?: string;
}

export interface GmailRawDraft {
  id: string;
  message: GmailRawMessage;
}

export interface GmailDraftRef {
  id: string;
  message?: GmailMessageRef;
}

export interface GmailDraftsListResponse {
  drafts?: GmailDraftRef[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}
