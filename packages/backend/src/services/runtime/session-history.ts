import { SESSION_HISTORY_ACTIVE_WINDOW, type SessionHistory } from "@crow-central-agency/shared";
import type { SessionHistoryAppend } from "./session-history.types.js";

const SESSION_LABEL_MAX_WORDS = 30;
const SESSION_LABEL_ELLIPSIS = "…";

export function deriveSessionLabel(message: string): string {
  const words = message.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length <= SESSION_LABEL_MAX_WORDS) {
    return words.join(" ");
  }

  return words.slice(0, SESSION_LABEL_MAX_WORDS).join(" ") + SESSION_LABEL_ELLIPSIS;
}

/**
 * Records the active session in the ledger. When the incoming id already names the
 * last entry, only its timestamp is refreshed; otherwise a new entry is appended and
 * families that no longer reach the active window are evicted.
 */
export function upsertSessionHistory(
  history: SessionHistory[] | undefined,
  append: SessionHistoryAppend
): SessionHistory[] {
  const entries = history ?? [];
  const lastEntry = entries.at(-1);
  if (lastEntry?.sessionId === append.sessionId) {
    return entries.map((entry, index) =>
      index === entries.length - 1 ? { ...entry, lastUpdatedTimestamp: append.timestamp } : entry
    );
  }

  const appended: SessionHistory = {
    sessionId: append.sessionId,
    lastUpdatedTimestamp: append.timestamp,
    label: deriveSessionLabel(append.message),
    workspace: append.workspace,
  };

  return evictSessionFamilies([...entries, appended]);
}

/**
 * Retains a family (a session and everything transitively branched from it) as long as
 * any of its members sits within the active window; evicts a family only once all of its
 * members have fallen out. Guarantees no stored branchPoint is left dangling.
 */
function evictSessionFamilies(entries: SessionHistory[]): SessionHistory[] {
  if (entries.length <= SESSION_HISTORY_ACTIVE_WINDOW) {
    return entries;
  }

  const familyRoot = resolveFamilyRoots(entries);
  const windowStart = entries.length - SESSION_HISTORY_ACTIVE_WINDOW;
  const retainedRoots = new Set<string>();
  for (let index = windowStart; index < entries.length; index++) {
    retainedRoots.add(familyRoot(entries[index].sessionId));
  }

  return entries.filter((entry) => retainedRoots.has(familyRoot(entry.sessionId)));
}

function resolveFamilyRoots(entries: SessionHistory[]): (sessionId: string) => string {
  const parent = new Map<string, string>();
  for (const entry of entries) {
    parent.set(entry.sessionId, entry.sessionId);
  }

  const find = (sessionId: string): string => {
    let root = sessionId;
    while (parent.get(root) !== root) {
      root = parent.get(root) as string;
    }

    let cursor = sessionId;
    while (cursor !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }

    return root;
  };

  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent.set(leftRoot, rightRoot);
    }
  };

  for (const entry of entries) {
    const parentSessionId = entry.branchPoint?.sessionId;
    if (parentSessionId !== undefined && parent.has(parentSessionId)) {
      union(entry.sessionId, parentSessionId);
    }
  }

  return find;
}
