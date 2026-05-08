import { RequestError } from "../../core/error/request-error.js";
import { parseDateTimeWithTimezone } from "../../utils/date-utils.js";
import type { ListGmailMessagesOptions } from "./google-client.types.js";
import { GOOGLE_SERVICE_NAME } from "./google-request.js";

const GMAIL_QUOTE_REQUIRED_PATTERN = /[\s"():&|]/;

/** Build a Gmail q-syntax search string from structured options. */
export function buildGmailListQuery(options: ListGmailMessagesOptions, userTimezone: string): string {
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
    const tokens = options.contains.trim().split(/\s+/).map(quoteGmailValue);
    parts.push(tokens.join(" "));
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

  if (options.afterDateTime !== undefined) {
    parts.push(`after:${toGmailEpochSeconds(options.afterDateTime, userTimezone, "afterDateTime")}`);
  }

  if (options.beforeDateTime !== undefined) {
    parts.push(`before:${toGmailEpochSeconds(options.beforeDateTime, userTimezone, "beforeDateTime")}`);
  }

  return parts.join(" ");
}

/**
 * Quote a Gmail q-operator value if it contains chars that would break parsing.
 * Bare values are fine for simple emails/names; quoted form handles spaces and special chars.
 */
function quoteGmailValue(value: string): string {
  if (GMAIL_QUOTE_REQUIRED_PATTERN.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return value;
}

function toGmailEpochSeconds(dateTimeStr: string, userTimezone: string, fieldName: string): number {
  const epochMs = parseDateTimeWithTimezone(dateTimeStr, userTimezone);
  if (!Number.isFinite(epochMs)) {
    throw new RequestError(`Invalid ${fieldName}: ${dateTimeStr}`, undefined, undefined, GOOGLE_SERVICE_NAME);
  }

  return Math.floor(epochMs / 1000);
}
