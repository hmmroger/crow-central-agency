import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import type { GmailLabelDiff } from "./gmail-label-utils.types.js";
import type { GmailMessageState } from "./google-client.types.js";

export const GMAIL_SYSTEM_LABEL = {
  INBOX: "INBOX",
  SENT: "SENT",
  DRAFT: "DRAFT",
  TRASH: "TRASH",
  SPAM: "SPAM",
  UNREAD: "UNREAD",
  STARRED: "STARRED",
  IMPORTANT: "IMPORTANT",
  CHAT: "CHAT",
  CATEGORY_PERSONAL: "CATEGORY_PERSONAL",
  CATEGORY_SOCIAL: "CATEGORY_SOCIAL",
  CATEGORY_PROMOTIONS: "CATEGORY_PROMOTIONS",
  CATEGORY_UPDATES: "CATEGORY_UPDATES",
  CATEGORY_FORUMS: "CATEGORY_FORUMS",
} as const;

export const GMAIL_SYSTEM_LABEL_IDS: ReadonlySet<string> = new Set(Object.values(GMAIL_SYSTEM_LABEL));

/**
 * Throw if any supplied label ID is a system label
 */
export function assertUserLabelIds(labelIds: string[] | undefined, fieldName: string): void {
  if (!labelIds) {
    return;
  }

  for (const id of labelIds) {
    if (GMAIL_SYSTEM_LABEL_IDS.has(id)) {
      throw new AppError(
        `${fieldName} contains system label "${id}". For UNREAD/INBOX/STARRED/IMPORTANT use update_gmail_message_state; for TRASH use move_gmail_message_to_trash. update_gmail_message_user_labels only accepts user-defined labels.`,
        APP_ERROR_CODES.VALIDATION
      );
    }
  }
}

/**
 * Map desired flag states to add/remove arrays of system label IDs.
 *   isRead     true  -> remove UNREAD;    false -> add UNREAD
 *   isArchived true  -> remove INBOX;     false -> add INBOX
 *   isStarred  true  -> add STARRED;      false -> remove STARRED
 *   isImportant true -> add IMPORTANT;    false -> remove IMPORTANT
 * Undefined flags are skipped (only specified flags are applied).
 */
export function buildStateLabelDiff(state: Partial<GmailMessageState>): GmailLabelDiff {
  const addLabelIds: string[] = [];
  const removeLabelIds: string[] = [];
  applyFlagToLabel(state.isRead, GMAIL_SYSTEM_LABEL.UNREAD, true, addLabelIds, removeLabelIds);
  applyFlagToLabel(state.isArchived, GMAIL_SYSTEM_LABEL.INBOX, true, addLabelIds, removeLabelIds);
  applyFlagToLabel(state.isStarred, GMAIL_SYSTEM_LABEL.STARRED, false, addLabelIds, removeLabelIds);
  applyFlagToLabel(state.isImportant, GMAIL_SYSTEM_LABEL.IMPORTANT, false, addLabelIds, removeLabelIds);
  return { addLabelIds, removeLabelIds };
}

/** Derive the four state booleans from a message's current label IDs. */
export function deriveStateFromLabelIds(labelIds: string[]): GmailMessageState {
  const labelSet = new Set(labelIds);
  return {
    isRead: !labelSet.has(GMAIL_SYSTEM_LABEL.UNREAD),
    isArchived: !labelSet.has(GMAIL_SYSTEM_LABEL.INBOX),
    isStarred: labelSet.has(GMAIL_SYSTEM_LABEL.STARRED),
    isImportant: labelSet.has(GMAIL_SYSTEM_LABEL.IMPORTANT),
  };
}

function applyFlagToLabel(
  flag: boolean | undefined,
  labelId: string,
  isInverse: boolean,
  addLabelIds: string[],
  removeLabelIds: string[]
): void {
  if ((!isInverse && flag === true) || (isInverse && flag === false)) {
    addLabelIds.push(labelId);
  } else if ((!isInverse && flag === false) || (isInverse && flag === true)) {
    removeLabelIds.push(labelId);
  }
}
