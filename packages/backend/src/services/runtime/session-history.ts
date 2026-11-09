import {
  MAX_SESSION_FAMILIES,
  type AgentConfig,
  type AgentMessage,
  type BranchPoint,
  type SessionFork,
  type SessionForkPoint,
  type SessionForkPoints,
  type SessionHistory,
  type SessionHistoryNode,
} from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import type { SessionHistoryUpdate, UpdatedSessionHistory } from "./session-history.types.js";

interface SessionFamilies {
  /** Family roots, most recently used family first. */
  rankedRoots: SessionHistory[];
  childrenByParentId: Map<string, SessionHistory[]>;
  rootIdBySessionId: Map<string, string>;
}

export const SESSION_LABEL_MAX_WORDS = 15;
const SESSION_LABEL_ELLIPSIS = "...";

export function deriveSessionLabel(message: string): string {
  const words = message
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length <= SESSION_LABEL_MAX_WORDS) {
    return words.join(" ");
  }

  return words.slice(0, SESSION_LABEL_MAX_WORDS).join(" ") + SESSION_LABEL_ELLIPSIS;
}

/**
 * Update the ledger with the session a turn runs in, and with it the tree standing over the ledger.
 */
export function updateSessionHistory(
  history: SessionHistory[] | undefined,
  sessionTree: SessionHistoryNode[],
  update: SessionHistoryUpdate
): UpdatedSessionHistory {
  const entries = history ?? [];
  const existingEntry = entries.find((entry) => entry.sessionId === update.sessionId);
  if (existingEntry === undefined) {
    entries.push({
      sessionId: update.sessionId,
      lastUpdatedTimestamp: update.timestamp,
      label: update.label ?? deriveSessionLabel(update.message),
      branchPoint: update.branchPoint,
    });
    const retainedEntries = evictSessionFamilies(entries, update.activeSessionId);
    return { history: retainedEntries, sessionTree: buildSessionTree(retainedEntries) };
  }

  existingEntry.lastUpdatedTimestamp = update.timestamp;
  if (refreshLeadingFamilyNode(sessionTree, update.sessionId, update.timestamp)) {
    return { history: entries };
  }

  return { history: entries, sessionTree: buildSessionTree(entries) };
}

/** Refreshes the session's node where the tree leads with its family, reporting whether it did. */
function refreshLeadingFamilyNode(sessionTree: SessionHistoryNode[], sessionId: string, timestamp: number): boolean {
  for (const [index, node] of sessionTree.entries()) {
    // A root past the first one ends the leading family.
    if (index > 0 && node.depth === 0) {
      return false;
    }

    if (node.sessionId === sessionId) {
      node.lastUpdatedTimestamp = timestamp;
      return true;
    }
  }

  return false;
}

/** Keep the most recently used families whole, ranked exactly as the session panel lists them. */
function evictSessionFamilies(entries: SessionHistory[], activeSessionId: string | undefined): SessionHistory[] {
  // Families never outnumber entries, so a short ledger cannot be over the cap.
  if (entries.length <= MAX_SESSION_FAMILIES) {
    return entries;
  }

  const { rankedRoots, rootIdBySessionId } = rankSessionFamilies(entries);
  if (rankedRoots.length <= MAX_SESSION_FAMILIES) {
    return entries;
  }

  const retainedRootIds = new Set(rankedRoots.slice(0, MAX_SESSION_FAMILIES).map((root) => root.sessionId));
  const activeRootId = activeSessionId === undefined ? undefined : rootIdBySessionId.get(activeSessionId);
  if (activeRootId !== undefined) {
    retainedRootIds.add(activeRootId);
  }

  return entries.filter((entry) => {
    const rootId = rootIdBySessionId.get(entry.sessionId);
    return rootId !== undefined && retainedRootIds.has(rootId);
  });
}

/** Resolve the ledger entry a session id names. Absent from the ledger means no longer addressable. */
export function getSessionHistoryEntry(
  sessionHistory: SessionHistory[] | undefined,
  sessionId: string
): SessionHistory {
  const entry = sessionHistory?.find((candidate) => candidate.sessionId === sessionId);
  if (!entry) {
    throw new AppError(`Session ${sessionId} is no longer available.`, APP_ERROR_CODES.SESSION_NOT_FOUND);
  }

  return entry;
}

/** The most recently used ledger entry whose label matches the name, ignoring case and surrounding whitespace. */
export function findSessionHistoryEntryByLabel(
  sessionHistory: SessionHistory[] | undefined,
  name: string
): SessionHistory | undefined {
  const normalizedName = name.trim().toLowerCase();
  let matchedEntry: SessionHistory | undefined;
  for (const entry of sessionHistory ?? []) {
    if (entry.label.trim().toLowerCase() !== normalizedName) {
      continue;
    }

    if (matchedEntry === undefined || entry.lastUpdatedTimestamp > matchedEntry.lastUpdatedTimestamp) {
      matchedEntry = entry;
    }
  }

  return matchedEntry;
}

/** Reject a branch the agent cannot make. The caller owns the runner, so it gates on IDLE itself. */
export function assertBranchSource(
  agent: AgentConfig,
  sessionHistory: SessionHistory[] | undefined,
  branchPoint: BranchPoint
): void {
  if (agent.persistSession === false) {
    throw new AppError(
      "This agent does not persist sessions, so there is nothing to branch from.",
      APP_ERROR_CODES.VALIDATION
    );
  }

  getSessionHistoryEntry(sessionHistory, branchPoint.sessionId);
}

function resolveParentLinks(entries: SessionHistory[]): Map<string, string> {
  const ledgerSessionIds = new Set(entries.map((entry) => entry.sessionId));
  const parentBySessionId = new Map<string, string>();

  for (const entry of entries) {
    const parentSessionId = entry.branchPoint?.sessionId;
    if (parentSessionId !== undefined && ledgerSessionIds.has(parentSessionId)) {
      parentBySessionId.set(entry.sessionId, parentSessionId);
    }
  }

  return parentBySessionId;
}

function resolveRootSessionId(sessionId: string, parentBySessionId: Map<string, string>): string {
  let rootSessionId = sessionId;
  let parentSessionId = parentBySessionId.get(rootSessionId);
  while (parentSessionId !== undefined) {
    rootSessionId = parentSessionId;
    parentSessionId = parentBySessionId.get(rootSessionId);
  }

  return rootSessionId;
}

/**
 * Group the ledger into families, ranked by the most recent timestamp anywhere in the family. Ties keep
 * ledger order, which is creation order. Eviction and the session panel both rank through here.
 */
function rankSessionFamilies(entries: SessionHistory[]): SessionFamilies {
  const parentBySessionId = resolveParentLinks(entries);
  const rankedRoots: SessionHistory[] = [];
  const childrenByParentId = new Map<string, SessionHistory[]>();
  const rootIdBySessionId = new Map<string, string>();
  const familyMaxByRootId = new Map<string, number>();

  for (const entry of entries) {
    const parentSessionId = parentBySessionId.get(entry.sessionId);
    if (parentSessionId === undefined) {
      rankedRoots.push(entry);
    } else {
      const siblings = childrenByParentId.get(parentSessionId);
      if (siblings) {
        siblings.push(entry);
      } else {
        childrenByParentId.set(parentSessionId, [entry]);
      }
    }

    const rootSessionId = resolveRootSessionId(entry.sessionId, parentBySessionId);
    rootIdBySessionId.set(entry.sessionId, rootSessionId);
    const familyMax = familyMaxByRootId.get(rootSessionId);
    if (familyMax === undefined || entry.lastUpdatedTimestamp > familyMax) {
      familyMaxByRootId.set(rootSessionId, entry.lastUpdatedTimestamp);
    }
  }

  // Array.prototype.sort is stable, so equal recency falls back to ledger order.
  rankedRoots.sort(
    (left, right) =>
      (familyMaxByRootId.get(right.sessionId) ?? right.lastUpdatedTimestamp) -
      (familyMaxByRootId.get(left.sessionId) ?? left.lastUpdatedTimestamp)
  );

  return { rankedRoots, childrenByParentId, rootIdBySessionId };
}

function appendSubtree(
  entry: SessionHistory,
  depth: number,
  childrenByParentId: Map<string, SessionHistory[]>,
  nodes: SessionHistoryNode[]
): void {
  nodes.push({
    sessionId: entry.sessionId,
    label: entry.label,
    lastUpdatedTimestamp: entry.lastUpdatedTimestamp,
    depth,
    isBranch: entry.branchPoint !== undefined,
  });

  for (const child of childrenByParentId.get(entry.sessionId) ?? []) {
    appendSubtree(child, depth + 1, childrenByParentId, nodes);
  }
}

/**
 * Project an agent's session ledger into the ordered, depth-annotated list the session panel renders.
 *
 * Families are ordered by the most recent timestamp anywhere in the family, so the family being worked
 * in leads. Inside a family the shape is fixed: a root is followed by its children depth-first in the
 * order they were branched, so a session keeps its place and the fork structure stays readable.
 */
export function buildSessionTree(sessionHistory: SessionHistory[] | undefined): SessionHistoryNode[] {
  const { rankedRoots, childrenByParentId } = rankSessionFamilies(sessionHistory ?? []);

  const nodes: SessionHistoryNode[] = [];
  for (const root of rankedRoots) {
    appendSubtree(root, 0, childrenByParentId, nodes);
  }

  return nodes;
}

/** The ledger entries forked from a session, keyed by the anchor they forked at, in branched order. */
export function groupForksByAnchor(
  sessionHistory: SessionHistory[] | undefined,
  sessionId: string
): Map<string, SessionFork[]> {
  const forksByAnchorId = new Map<string, SessionFork[]>();
  for (const entry of sessionHistory ?? []) {
    if (entry.branchPoint?.sessionId !== sessionId) {
      continue;
    }

    const fork: SessionFork = {
      sessionId: entry.sessionId,
      label: entry.label,
      lastUpdatedTimestamp: entry.lastUpdatedTimestamp,
    };
    const siblings = forksByAnchorId.get(entry.branchPoint.fromMessageId);
    if (siblings) {
      siblings.push(fork);
    } else {
      forksByAnchorId.set(entry.branchPoint.fromMessageId, [fork]);
    }
  }

  return forksByAnchorId;
}

/**
 * Resolve a session's forks against its loaded messages. Forks sharing an anchor group under the first
 * message carrying it; one whose anchor is not in the messages has no message left to show.
 */
export function buildSessionForkPoints(
  forksByAnchorId: Map<string, SessionFork[]>,
  messages: AgentMessage[]
): SessionForkPoints {
  const forkPoints: SessionForkPoint[] = [];
  for (const message of messages) {
    const anchorId = message.branchAnchorId;
    const forks = anchorId === undefined ? undefined : forksByAnchorId.get(anchorId);
    if (anchorId === undefined || forks === undefined) {
      continue;
    }

    forkPoints.push({ messageId: message.id, excerpt: deriveSessionLabel(message.content), forks });
    forksByAnchorId.delete(anchorId);
  }

  return { forkPoints, unavailableForks: Array.from(forksByAnchorId.values()).flat() };
}
