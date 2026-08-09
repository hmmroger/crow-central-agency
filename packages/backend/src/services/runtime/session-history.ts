import { SESSION_HISTORY_ACTIVE_WINDOW, type SessionHistory } from "@crow-central-agency/shared";
import type { SessionHistoryAppend } from "./session-history.types.js";

const SESSION_LABEL_MAX_WORDS = 30;
const SESSION_LABEL_ELLIPSIS = "...";

export function deriveSessionLabel(message: string): string {
  const words = message.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length <= SESSION_LABEL_MAX_WORDS) {
    return words.join(" ");
  }

  return words.slice(0, SESSION_LABEL_MAX_WORDS).join(" ") + SESSION_LABEL_ELLIPSIS;
}

// Mutates `history` in place; eviction may still return a filtered copy, so callers must adopt the
// returned reference rather than keep their own.
export function upsertSessionHistory(
  history: SessionHistory[] | undefined,
  append: SessionHistoryAppend
): SessionHistory[] {
  const entries = history ?? [];
  const lastEntry = entries.at(-1);
  // The active session is always the last entry, and its timestamp is the only field that ever
  // changes, so the refresh is a single in-place write rather than a rebuild of the ledger.
  if (lastEntry?.sessionId === append.sessionId) {
    lastEntry.lastUpdatedTimestamp = append.timestamp;
    return entries;
  }

  entries.push({
    sessionId: append.sessionId,
    lastUpdatedTimestamp: append.timestamp,
    label: deriveSessionLabel(append.message),
    workspace: append.workspace,
  });

  return evictSessionFamilies(entries);
}

// Evicting a family only once all of its members leave the window is what keeps branchPoint from dangling.
function evictSessionFamilies(entries: SessionHistory[]): SessionHistory[] {
  if (entries.length <= SESSION_HISTORY_ACTIVE_WINDOW) {
    return entries;
  }

  const familyRoots = resolveFamilyRoots(entries);
  const windowStart = entries.length - SESSION_HISTORY_ACTIVE_WINDOW;
  const retainedRoots = new Set<string>();
  for (let index = windowStart; index < entries.length; index++) {
    retainedRoots.add(familyRoots[index]);
  }

  let evicting = false;
  for (let index = 0; index < windowStart; index++) {
    if (!retainedRoots.has(familyRoots[index])) {
      evicting = true;
      break;
    }
  }

  if (!evicting) {
    return entries;
  }

  return entries.filter((_entry, index) => retainedRoots.has(familyRoots[index]));
}

// Entries are appended in creation order and a family is evicted whole, so a branch parent always
// precedes its child: one forward pass propagates each root down its lineage. A branchPoint whose
// parent is absent starts a new family, matching how an uninitiated session id is recorded.
function resolveFamilyRoots(entries: SessionHistory[]): string[] {
  const rootBySessionId = new Map<string, string>();
  const familyRoots: string[] = [];
  for (const entry of entries) {
    const parentSessionId = entry.branchPoint?.sessionId;
    const parentRoot = parentSessionId === undefined ? undefined : rootBySessionId.get(parentSessionId);
    const familyRoot = parentRoot ?? entry.sessionId;
    rootBySessionId.set(entry.sessionId, familyRoot);
    familyRoots.push(familyRoot);
  }

  return familyRoots;
}
