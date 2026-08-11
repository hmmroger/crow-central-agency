import { MAX_SESSION_HISTORY, type SessionHistory } from "@crow-central-agency/shared";
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

export function upsertSessionHistory(
  history: SessionHistory[] | undefined,
  append: SessionHistoryAppend
): SessionHistory[] {
  const entries = history ?? [];
  const existingEntry = entries.find((entry) => entry.sessionId === append.sessionId);
  if (existingEntry !== undefined) {
    existingEntry.lastUpdatedTimestamp = append.timestamp;
    return entries;
  }

  entries.push({
    sessionId: append.sessionId,
    lastUpdatedTimestamp: append.timestamp,
    label: deriveSessionLabel(append.message),
    workspace: append.workspace,
    branchPoint: append.branchPoint,
  });

  return evictSessionFamilies(entries);
}

function evictSessionFamilies(entries: SessionHistory[]): SessionHistory[] {
  if (entries.length <= MAX_SESSION_HISTORY) {
    return entries;
  }

  const familyRoots: string[] = [];
  const rootBySessionId = new Map<string, string>();
  for (const entry of entries) {
    const parentSessionId = entry.branchPoint?.sessionId;
    const parentRoot = parentSessionId === undefined ? undefined : rootBySessionId.get(parentSessionId);
    const familyRoot = parentRoot ?? entry.sessionId;
    familyRoots.push(familyRoot);
    rootBySessionId.set(entry.sessionId, familyRoot);
  }

  const retainedRoots = new Set(familyRoots.slice(entries.length - MAX_SESSION_HISTORY));

  return entries.filter((_unused, index) => retainedRoots.has(familyRoots[index]));
}
